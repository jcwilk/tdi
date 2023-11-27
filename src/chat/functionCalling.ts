import { FunctionCall, FunctionOption, FunctionParameters, getEmbedding } from "../openai_api";
import { Conversation, Message, observeNewMessages, sendFunctionCall, teardownConversation } from "./conversation";
import { ConversationDB, FunctionResultDB, FunctionResultSpec, MessageDB } from "./conversationDb";
import { v4 as uuidv4 } from "uuid";
import { reprocessMessagesStartingFrom } from "./messagePersistence";
import { Observable, OperatorFunction, async, concatMap, filter, firstValueFrom, from, isObservable, map, tap } from "rxjs";
import { buildParticipatedConversation } from "../components/chat/useConversationStore";
import { isAtLeastOne } from "../tsUtils";
import { APIKeyFetcher } from "../api_key_storage";

// NB: Conceptually this could also be an Observable<string> or Promise<string>, however because we're
// sending it to the worker, it needs to be serializable, and Observables and Promises are not.
export type DynamicFunctionWorkerInput = undefined | string | string[];

export type DynamicFunctionWorkerPayload = {
  functionHash: string;
  input: DynamicFunctionWorkerInput;
}

export type DynamicFunctionWorkerResponse = {
  status: "complete"
 } | {
  status: "incomplete";
  content: string;
}

export type FunctionParameter = {
  name: string;
  type: "string" | "number" | "array" | "boolean";
  description: string;
  required: boolean;
  items?: {
    type: "string"; // could be other things hypothetically, but for now it's just this
  }
};

export type FunctionReturn = Observable<string> | Promise<string> | string | string[] | undefined;

type FunctionSpec = {
  name: string;
  description: string;
  implementation: (...args: any[]) => FunctionReturn;
  parameters: FunctionParameter[];
};

type FunctionUtils = {
  db: ConversationDB;
  functionMessagePromise: Promise<FunctionMessage>;
  functionOptions: FunctionOption[];
}

export type FunctionMessage = MessageDB & {
  role: 'function'
}

export function isFunctionMessage(message: Message): message is FunctionMessage {
  return message.role === "function";
}

export type EmbellishedFunctionMessage = FunctionMessage & {
  isComplete: boolean;
  results: FunctionResultDB[];
}

export function isEmbellishedFunctionMessage(message: Message): message is EmbellishedFunctionMessage {
  return isFunctionMessage(message) && "isComplete" in message && "results" in message;
}

// This is a little unusual, but doing it as an experiment - types which differ only by guard
// Because the difference is only in the
export type CompleteFunctionMessage = EmbellishedFunctionMessage & {
  isComplete: true;
};
export type IncompleteFunctionMessage = EmbellishedFunctionMessage & {
  isComplete: false;
};

function concatWithEllipses(str: string, maxLength: number): string {
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}

function sharedSearchSpecBuilder(table: 'embeddings' | 'summaryEmbeddings', name: string, description: string): FunctionSpec {
  return {
    name,
    description,
    implementation: (utils: {db: ConversationDB}, query: string, limit: number, descendedFromSHA?: string, maxDepth?: number): Observable<string> => {
      const { db } = utils;

      const processMessages = async () => {
        const embedding = await getEmbedding(query);
        const shaResults = await db.searchEmbedding(embedding, limit, table, descendedFromSHA, maxDepth);

        if (shaResults.length === 0) {
          return ["No results found."];
        } else {
          const messages = (await Promise.all(shaResults.map(sha => db.getMessageByHash(sha)))).filter((message): message is MessageDB => Boolean(message));
          return messages.map(message => `${message.hash}: ${concatWithEllipses(message.content.replace(/\n/g, ""), 60)}`);
        }
      };

      return from(processMessages()).pipe(
        concatMap(message => from(message))
      );
    },
    parameters: [
      {
        name: "query",
        type: "string",
        description: "The query to convert into an embedding for the search.",
        required: true
      },
      {
        name: "limit",
        type: "number",
        description: "The maximum number of message results to return.",
        required: true
      },
      {
        name: "descendedFromSHA",
        type: "string",
        description: "Optional - when provided, only searches messages descended from the message with the provided SHA. Do not include quotes.",
        required: false
      },
      {
        name: "maxDepth",
        type: "number",
        description: "Optional - when provided, only searches `maxDepth` more levels beneath the specified `descendedFromSHA`.",
        required: false
      }
    ]
  }
}

const generateDynamicFunctionDescription = `
Create a JavaScript function by specifying the body of the function, including the return statement but excluding the outer function definition or curly braces. \`functionBody\` is a string of code, and \`dependencies\` is an array of callable function SHAs or function names provided in the API call payload. \`input\` is an RxJS Observable<string>, possibly EMPTY. Return values are coerced into Observable<string> and can be RxJS.EMPTY, string, string[], undefined, or Observable<string>. Use \`RxJS\` for RxJS functions and \`dependencies\` with SHAs or function names to call other functions. Functions are sandboxed, identified by SHA, and invoked with \`invoke_dynamic_function\`.

Example:
###JSON
{
  "functionBody": "return RxJS.forkJoin([dependencies['c2931bf195'](input), dependencies['some_function']({someParam: 10, otherParam: "yes"})]).pipe(RxJS.map(results => results.join(' and ')));",
  "dependencies": ['c2931bf195', 'some_function']
}
###
`.trim()

const invokeDynamicFunctionDescription = `
Invoke a dynamic function using its SHA hash with \`invoke_dynamic_function\`. Provide \`functionHash\`, the SHA of the function, and \`input\`, an array of strings to pass as arguments. The function returns an RxJS Observable<string> with the function's output. The function is executed in a Worker, ensuring isolation and asynchronous execution. The observable emits values as they are received from the worker and completes when the function execution is done.

Example:
###JSON
{
  "functionHash": "c2931bf195957b133ebb5e8820df94a20c96887e234d2869ecafad53846501e7",
  "input": ["sample input"]
}
###
`.trim();

export const invokeDynamicFunctionName = "invoke_dynamic_function";

export const functionSpecs: FunctionSpec[] = [
  sharedSearchSpecBuilder(
    'embeddings',
    'direct_message_embedding_search',
    "Compares the embedding of the search `query` with the embeddings of the contents of messages using cosine similarity. Returns 'limit' number of closest matching messages."
  ),
  sharedSearchSpecBuilder(
    'summaryEmbeddings',
    'summary_message_embedding_search',
    "Compares the embedding of the search `query` with the embeddings of the summaries of conversations terminating with potential message results using cosine similarity. Returns 'limit' number of closest matching messages."
  ),
  {
    name: "append_user_reply",
    description: "Appends the provided message content as a user (or overridden `role`) reply to the message specified by `parentHash`.",
    implementation: async (utils: {db: ConversationDB}, content: string, role?: string, parentHash?: string) => {
      role ||= "user";
      if (!["user", "system", "assistant"].includes(role)) throw new Error(`Invalid role "${role}". Must be either "user" or "system" or "assistant".`);
      const filteredRole = role as "user" | "system" | "assistant";

      let messages: MessageDB[] = [];

      if(parentHash) {
        const leafMessage = await utils.db.getMessageByHash(parentHash);
        if (!leafMessage) throw new Error(`Message with SHA ${parentHash} not found.`);

        messages = await utils.db.getConversationFromLeafMessage(leafMessage);
      }

      const newMessage: Message = {
        role: filteredRole,
        content
      };
      const newMessages = [...messages, newMessage];
      if (!isAtLeastOne(newMessages)) throw new Error("Unexpected codepoint reached - empty messages array in append_user_reply"); // compilershutup for typing

      const processedMessages = await reprocessMessagesStartingFrom("paused", newMessages);
      const newLeafMessage = processedMessages[processedMessages.length - 1].message;

      return newLeafMessage.hash;
    },
    parameters: [
      {
        name: "content",
        type: "string",
        description: "The content of the new message.",
        required: true
      },
      {
        name: "role",
        type: "string",
        description: "Must be one of either 'user', 'system', or `assistant`. (defaults to 'user')",
        required: false
      },
      {
        name: "parentHash",
        type: "string",
        description: "The SHA of the message to append a reply to. (defaults to starting a new conversation from the root rather than replying to an existing message)",
        required: false
      }
    ]
  },
  {
    name: "conversation_completion",
    description: "Uses GPT to get the next message in a conversation at the specified leaf message.",
    implementation: async (utils: {db: ConversationDB}, sha: string, enabledFunctions?: string): Promise<string> => {
      const splitEnabledFunctions = (enabledFunctions || "").split(",").map((s) => s.trim());
      const functionOptions = getAllFunctionOptions().filter((option) => splitEnabledFunctions.includes(option.name));

      const leafMessage = await utils.db.getMessageByHash(sha);
      if (!leafMessage) throw new Error(`Message with SHA ${sha} not found.`);

      if (!["system", "user"].includes(leafMessage.role)) return "";

      const messages = await utils.db.getConversationFromLeafMessage(leafMessage);
      const conversation = await buildParticipatedConversation(utils.db, messages, "gpt-4", functionOptions);

      const observeReplies = observeNewMessages(conversation, false)
      return await firstValueFrom(observeReplies).then((firstValue) => {
        teardownConversation(conversation);
        return firstValue.hash;
      });
    },
    parameters: [
      {
        name: "sha",
        type: "string",
        description: "The SHA address of the last message in the conversation to run a completion against. If the message is not a user or system message, the function will complete without a result.",
        required: true
      },
      {
        name: "enabledFunctions",
        type: "string",
        description: "A comma separated list of function names to enable for this completion. Defaults to no functions.",
        required: false
      }
    ]
  },
  {
    name: "generate_dynamic_function",
    description: generateDynamicFunctionDescription,
    implementation: async (utils: {db: ConversationDB, functionMessagePromise: Promise<FunctionMessage>, functionOptions: FunctionOption[]}, functionBody: string, dependencies?: string[]) => {
      dependencies ||= [];
      const functionMessage = await utils.functionMessagePromise;
      const functionMessageContent = deserializeFunctionMessageContent(functionMessage.content);
      if (!functionMessageContent) throw new Error("Invalid function message content");

      // iterate through the dependencies and assert that they all correspond to entries in functionOptions
      const functionOptions = utils.functionOptions;
      const functionOptionNames = functionOptions.map((option) => option.name);
      const missingDependencies = dependencies.filter((dep) => !functionOptionNames.includes(dep));

      // filter the missing dependencies down to those which don't exist as hashes in the database
      const missingNonDynamicDependencies = (await Promise.all(
        missingDependencies.map(async (dep) => {
          const message = await utils.db.getMessageByHash(dep);
          return message ? null : dep;
        })
      )).filter(Boolean) as string[];

      if (missingNonDynamicDependencies.length > 0) throw new Error(`Missing dependencies: ${missingNonDynamicDependencies.join(", ")}`);

      // save each dependency to the database
      await Promise.all(
        dependencies.map(async (dep) => {
          return await utils.db.saveFunctionDependency(
            functionMessage,
            dep
          );
        })
      );

      return "Dynamic function persisted:\n\n" + JSON.stringify({
        hash: functionMessage.hash,
        functionBody,
        dependencies
      });
    },
    parameters: [
      {
        name: "functionBody",
        type: "string",
        description: "The body of the function to generate without the enclosing function definition or surrounding curly braces.",
        required: true
      },
      {
        name: "dependencies",
        type: "array",
        items: {
          type: "string"
        },
        description: "A list of the names of the functions to which the generated function should have access. Defaults to [].",
        required: false
      }
    ]
  },
  {
    name: invokeDynamicFunctionName,
    description: invokeDynamicFunctionDescription,
    implementation: (_utils: {}, functionHash: string, input: DynamicFunctionWorkerInput) => {
      const observable = new Observable<string>(subscriber => {
        const worker = new Worker((window as any).workerPath);
        worker.postMessage({SET_API_KEY: APIKeyFetcher()})

        worker.addEventListener('message', (event) => {
          const data = event.data as DynamicFunctionWorkerResponse;
          //console.log("received message", data)

          if (data.status === "complete") {
            subscriber.complete();
            worker.terminate();
            return;
          }
          subscriber.next(typeof(data.content) === "object" ? JSON.stringify(data.content) : String(data.content));
        });

        worker.addEventListener('error', (event) => {
          console.log("received error", event)
          subscriber.error(event.error || event.message);
          worker.terminate();
        });

        // NB: having the worker postMessage here means it won't send the first message until the observable is subscribed to
        // this is important so that we don't miss a response from the worker, but means that it's important to not subscribe
        // to this observable more than once
        const message: DynamicFunctionWorkerPayload = {
          functionHash,
          input
        };
        worker.postMessage(message);
      });

      return observable;
    },
    parameters: [
      {
        name: "functionHash",
        type: "string",
        description: "The SHA of the function to invoke.",
        required: true
      },
      {
        name: "input",
        type: "array",
        items: {
          type: "string"
        },
        description: "The input to provide to the function. Defaults to [].",
        required: false
      }
    ]
  },
  {
    name: "get_message_property",
    description: "Gets a `property` of a message at the provided `sha` address.",
    implementation: (utils: {db: ConversationDB}, sha: string, property: string) => {
      property ||= "content";

      return new Observable<string>(subscriber => {
        (async () => {
          const message = await utils.db.getMessageByHash(sha);
          if (!message) {
            subscriber.error(`Message with SHA ${sha} not found.`);
            return;
          }

          if (property === "role" || property === "content" || property  === "parentHash" || property === "timestamp" || property === "hash") {
            subscriber.next(String(message[property]));
            return;
          }

          if (property === "children") {
            const children = await utils.db.getDirectChildren(message);
            children.forEach((child) => subscriber.next(child.hash));
            return;
          }

          if (property === "summary") {
            const summary = await utils.db.getSummaryByHash(message.hash);
            if (summary?.summary) subscriber.next(summary.summary);
            return;
          }

          if (property === "functionResults") {
            if(!isFunctionMessage(message)) return;

            const deserializedContent = deserializeFunctionMessageContent(message.content);
            if(!deserializedContent) return;

            const functionResults = await utils.db.getFunctionResultsByUUID(deserializedContent.uuid);
            if (functionResults.find(({completed}) => completed)) {
              functionResults.filter(({completed}) => !completed).forEach((result) => subscriber.next(result.result));
            }
            return;
          }

          if (property === "functionDependencies") {
            const dependencies = await utils.db.getFunctionDependenciesByHash(message.hash);
            dependencies.forEach((dep) => subscriber.next(dep.dependencyName));
            return;
          }

          if (property === "embedding") {
            const embedding = await utils.db.getEmbeddingByHash(message.hash);
            if (embedding) embedding.embedding.forEach(val => subscriber.next(String(val)));
            return;
          }

          if (property === "summaryEmbedding") {
            const embedding = await utils.db.getSummaryEmbeddingByHash(message.hash);
            if (embedding) embedding.embedding.forEach(val => subscriber.next(String(val)));
            return;
          }

          throw new Error(`Invalid property "${property}". Must be either 'role', 'content', 'parentHash', 'timestamp', 'hash', 'children', 'summary', 'functionResults', 'functionDependencies', 'embedding', or 'summaryEmbedding'.`);
        })().then(() => subscriber.complete());
      });
    },
    parameters: [
      {
        name: "sha",
        type: "string",
        description: "SHA address which specifies the target message for property retrieval.",
        required: true
      },
      {
        name: "property",
        type: "string",
        description: `The property to retrieve, defaults to 'content'. Must be one of either:
'role'
'content'
'parentHash'
'timestamp' (stringified integer representation)
'hash'
'children' (their SHAs)
'summary' (recursive summary representing the conversation path from root to the specified message)
'functionResults' (EMPTY if not a completed function message)
'functionDependencies'
'embedding' (EMPTY if no embedding, series of stringified floats if present)
'summaryEmbedding' (same behavior as 'embedding' but for the recursive summary)
        `.trim(),
        required: false
      }
    ]
  },
  {
    name: "recursively_summarize_path",
    description: "For any messages which are missing it, recursively summarizes and generates an embedding for both the message content and the summary for every message in the conversation path from the root to the message specified by `sha`. Useful for ensuring that all messages in a conversation path have summaries and embeddings before performing an action which depends on them.",
    implementation: async (utils: {db: ConversationDB}, sha: string): Promise<string> => {
      const message = await utils.db.getMessageByHash(sha);
      if (!message) throw new Error(`Message with SHA ${sha} not found.`);

      const messages = await utils.db.getConversationFromLeafMessage(message);
      const processedMessageResults = await reprocessMessagesStartingFrom("gpt-4", messages);
      await Promise.all(processedMessageResults.map(({metadataRecordsPromise}) => metadataRecordsPromise));

      return "";
    },
    parameters: [
      {
        name: "sha",
        type: "string",
        description: "SHA address which specifies the last message in a conversation path starting at the root of the tree.",
        required: true
      }
    ]
  },
  {
    name: "jsonp_data_retrevial",
    description: "Retrieves data from a JSONP endpoint and returns it as a string via JSON.stringify.",
    implementation: (_utils: {db: ConversationDB}, url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        var callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        (window as any)[callbackName] = function(data: {data: {[key: string]: any}}) {
            delete (window as any)[callbackName];
            document.body.removeChild(script);
            resolve(JSON.stringify(data.data));
        };

        var script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        document.body.appendChild(script);
      });
    },
    parameters: [
      {
        name: "url",
        type: "string",
        description: "The URL of the JSONP-compatible endpoint to retrieve data from. The JSONP callback parameter will be automatically appended to the URL.",
        required: true
      }
    ]
  },
  {
    name: "cors_data_retrevial",
    description: "Retrieves data from a CORS-compatible endpoint and returns it as a string via JSON.stringify.",
    implementation: (_utils: {db: ConversationDB}, url: string): Promise<string> => {
      return fetch(url).then((response) => response.text());
    },
    parameters: [
      {
        name: "url",
        type: "string",
        description: "The URL of the CORS-compatible endpoint to retrieve data from.",
        required: true
      }
    ]
  },
  {
    name: "alert",
    description: "Displays a browser alert with the provided message.",
    implementation: async (_utils: {db: ConversationDB}, message: string) => {
      alert(message);
      return "sent alert!"
    },
    parameters: [
      {
        name: "message",
        type: "string",
        description: "The message to display in the alert.",
        required: true
      }
    ]
  },
  {
    name: "prompt",
    description: "Opens a prompt dialog asking the user to input some text.",
    implementation: (_utils: {db: ConversationDB}, message: string, defaultValue?: string) => prompt(message, defaultValue) || "",
    parameters: [
      {
        name: "message",
        type: "string",
        description: "The message to display in the prompt.",
        required: true
      },
      {
        name: "defaultValue",
        type: "string",
        description: "The default value to prefill in the prompt input.",
        required: false
      }
    ]
  },
  {
    name: "error",
    description: "Throws an error with the provided message.",
    implementation: (_utils: {db: ConversationDB}, message: string) => {
      throw new Error(message);
    },
    parameters: [
      {
        name: "message",
        type: "string",
        description: "The message to display in the error.",
        required: true
      }
    ]
  }
]

export function getAllFunctionOptions(): FunctionOption[] {
  return functionSpecs.map((spec) => ({
    name: spec.name,
    description: spec.description,
    parameters: {
      type: "object",
      properties: spec.parameters.reduce((acc, param) => {
        acc[param.name] = {
          type: param.type,
          description: param.description
        };
        if (param.items) acc[param.name].items = param.items;
        return acc;
      }, {} as any)
    },
    required: spec.parameters.filter((p) => p.required).map((p) => p.name)
  }));
}

export function isActiveFunction(conversation: Conversation, functionCall: FunctionCall) {
    return conversation.functions.some((f) => f.name === functionCall.name);
}

async function getFunctionMessageDBPromise(conversation: Conversation, functionMessageContent: FunctionMessageContent): Promise<FunctionMessage> {
  const newMessagesObserver = observeNewMessages(conversation, false);

  return firstValueFrom(newMessagesObserver.pipe(
    filter(isFunctionMessage),
    filter((message) => deserializeFunctionMessageContent(message.content)?.uuid === functionMessageContent.uuid)
  ));
}

export async function callFunction(conversation: Conversation, functionCall: FunctionCall, db: ConversationDB): Promise<void> {
  try {
    const code = generateCodeForFunctionCall(functionCall);
    //console.log("eval!", code);

    const uuid = uuidv4();
    const functionMessageContent: FunctionMessageContent = {
      ...functionCall,
      uuid,
      v: 1,
    };
    const initialContent = serializeFunctionMessageContent(functionMessageContent);
    sendFunctionCall(conversation, initialContent);

    const functionMessagePromise = getFunctionMessageDBPromise(conversation, functionMessageContent);

    // functionMessagePromise - only used by generate_dynamic_function
    // functionOptions - not used, but leaving it for now in case we want to use it in the future
    const result = code({db, functionMessagePromise, functionOptions: conversation.functions});

    const saveFunctionResult = async (resultString: string, completed: boolean) => {
      if (completed) {
        return db.saveFunctionResult({
          uuid,
          functionName: functionCall.name,
          completed: true
        })
      }

      if (resultString === "") return;

      return db.saveFunctionResult({
        uuid,
        functionName: functionCall.name,
        result: resultString,
        completed: false
      });
    };

    // TODO: may or may not be possible to merge the logic below with `coerceInputOrReturn` in dynamicFunctions.worker.ts
    // but the deadline approaches and done is better than perfect, can always come back to this later.

    // observables are a bit different since there's multiple results
    if (isObservable(result)) {
      result.subscribe({
        next: async resultString => {
          await saveFunctionResult(resultString, false);
        },
        complete: async () => {
          await saveFunctionResult('', true);
        }
      });
      return; // Return early to prevent saving completion spec below
    }

    if (result === undefined) {
      await saveFunctionResult('', true);
      return;
    }

    if (Array.isArray(result)) {
      for (const element of result) {
        await saveFunctionResult(element, false);
      }
      await saveFunctionResult('', true);
      return;
    }

    const resultString = await result;
    await saveFunctionResult(resultString, false);
    await saveFunctionResult('', true);
  } catch (error) {
    console.error("caught error in callFunction", error);
    throw error;
  }
}

export function coerceAndOrderFunctionParameters(functionParameters: FunctionParameters, functionSpec: FunctionSpec): any[] {
  return functionSpec.parameters.map(param => {
    if (param.name in functionParameters) {
      const value = functionParameters[param.name];
      if (param.type === "number") return Number(value);
      if (param.type === "boolean") return Boolean(value);
      if (param.type === "string") return String(value);
      if (param.type === "array" && param.items?.type === "string") return value.map(String);
      else throw new Error(`Unsupported parameter type "${param.type}" for parameter "${param.name}". It had value of ${value}`); // Just add handling for the unknown type directly above this line
    } else if (param.required) {
      throw new Error(`Required parameter "${param.name}" missing in function call.`);
    } else {
      return undefined; // Default value for optional parameters not provided in the call
    }
  });
}

export function generateCodeForFunctionCall(functionCall: FunctionCall): (utils: FunctionUtils) => FunctionReturn {
  // Find the function spec for the called function
  const funcSpec = functionSpecs.find(func => func.name === functionCall.name);
  if (!funcSpec) {
    throw new Error(`Function "${functionCall.name}" not found in specs.`);
  }

  // Construct the ordered arguments list
  const args = coerceAndOrderFunctionParameters(functionCall.parameters, funcSpec);

  return (utils: FunctionUtils): FunctionReturn => {
    return funcSpec.implementation(utils, ...args);
  };
}

export type FunctionMessageContent = {
  uuid: string;
  v: number;
  name: string;
  parameters: FunctionParameters;
}

export type DynamicFunctionMessageContent = FunctionMessageContent & {
  parameters: {
    functionBody: string;
    dependencies: string[];
  }
};

export function isDynamicFunctionMessageContent(content: FunctionMessageContent): content is DynamicFunctionMessageContent {
  return content.name === "generate_dynamic_function";
}

export function serializeFunctionMessageContent(content: FunctionMessageContent): string {
  return JSON.stringify(content);
}

export function deserializeFunctionMessageContent(content: string): FunctionMessageContent | null {
  try {
    const parsedContent = JSON.parse(content);
    if (parsedContent.uuid && parsedContent.v === 1) {
      return parsedContent;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

export async function getFunctionResultsFromMessage(db: ConversationDB, message: MessageDB): Promise<FunctionResultDB[] | null> {
  if (message.role !== 'function') {
    return null;
  }

  const functionMessageContent = deserializeFunctionMessageContent(message.content);
  if (!functionMessageContent) {
    console.error("Invalid function message content", message.content)
    return null;
  }

  return db.getFunctionResultsByUUID(functionMessageContent.uuid);
}

export async function embellishFunctionMessage(db: ConversationDB, message: MessageDB): Promise<EmbellishedFunctionMessage | null> {
  const functionResults = await getFunctionResultsFromMessage(db, message);
  if (functionResults === null) {
    return null;
  }

  const functionMessage: EmbellishedFunctionMessage = {
    ...message,
    role: 'function', // mostly just to appease the type system
    isComplete: functionResults.findIndex(({completed}) => completed) !== -1,
    results: functionResults
  };

  return functionMessage;
}

function createCodeBlock(text: string): string {
  // Determine the maximum sequence of backticks in the text
  const maxBackticks = Math.max(...text.match(/`+/g)?.map(s => s.length) ?? [0]);

  // Check if the text contains new lines
  const hasNewLines = /\r?\n/.test(text);

  // If the text contains new lines, create a multiline code block
  if (hasNewLines) {
    // Multiline code blocks require at least three backticks as delimiters
    const delimiter = '`'.repeat(Math.max(3, maxBackticks + 1));
    return `\n${delimiter}\n${text}\n${delimiter}`;
  } else {
    // Create a sequence of backticks one longer than the maximum found in the text
    const delimiter = '`'.repeat(maxBackticks + 1);
    return `${delimiter}${text}${delimiter}`;
  }
}

export async function possiblyEmbellishedMessageToMarkdown(db: ConversationDB, message: MessageDB): Promise<string> {
  if (!isEmbellishedFunctionMessage(message)) {
    return message.content;
  }
  const invocation = deserializeFunctionMessageContent(message.content);
  if (!invocation) {
    return message.content;
  }

  const results = await db.getFunctionResultsByUUID(invocation.uuid);

  const completed = results.findIndex(({completed}) => completed) !== -1;
  const nonCompletionResults = results.filter(({completed}) => !completed);
  return `
**function**: ${createCodeBlock(invocation.name)}

${Object.entries(invocation.parameters).map(([key, value]) => `**${key}**: ${createCodeBlock(typeof(value) === "string" ? value : JSON.stringify(value))}`).join("\n")}

${nonCompletionResults.map((result) => {

const contents = createCodeBlock(result.result ?? "");
return `Result: ${contents}`
}).join("\n")}
${completed ? "Function call complete." : "Function call incomplete..."}
  `.trim();
}
