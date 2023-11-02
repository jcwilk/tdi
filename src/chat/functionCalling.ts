import { FunctionCall, FunctionOption, FunctionParameters, getEmbedding } from "../openai_api";
import { Conversation, Message, observeNewMessages, sendFunctionCall, teardownConversation } from "./conversation";
import { ConversationDB, FunctionResultDB, FunctionResultSpec, MessageDB } from "./conversationDb";
import { v4 as uuidv4 } from "uuid";
import { reprocessMessagesStartingFrom } from "./messagePersistence";
import { Observable, OperatorFunction, concatMap, filter, firstValueFrom, from, isObservable, map, tap } from "rxjs";
import { buildParticipatedConversation } from "../components/chat/useConversationStore";
import { isAtLeastOne } from "../tsUtils";

type FunctionParameter = {
  name: string;
  type: string;
  description: string;
  required: boolean;
};

type FunctionSpec = {
  name: string;
  description: string;
  implementation: (...args: any[]) => Observable<string> | Promise<string> | string;
  parameters: FunctionParameter[];
};

type FunctionUntils = {
  db: ConversationDB;
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

function sharedSearchSpecBuilder(table: 'embeddings' | 'summaryEmbeddings', name: string, description: string) {
  return {
    name,
    description,
    implementation: (utils: {db: ConversationDB}, query: string, limit: number, ancestor?: string): Observable<string> => {
      const { db } = utils;

      const processMessages = async () => {
        const embedding = await getEmbedding(query);
        const shaResults = await db.searchEmbedding(embedding, limit, table, ancestor);

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
      }
    ]
  }
}

const functionSpecs: FunctionSpec[] = [
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
    description: "Appends the provided message content as a user reply to the message specified by the SHA.",
    implementation: async (utils: {db: ConversationDB}, content: string, rawRole?: string, sha?: string) => {
      rawRole ||= "user";
      if (rawRole !== "user" && rawRole !== "system") throw new Error(`Invalid role "${rawRole}". Must be either "user" or "system".`);
      const role = rawRole as "user" | "system";

      let messages: MessageDB[] = [];

      if(sha) {
        const leafMessage = await utils.db.getMessageByHash(sha);
        if (!leafMessage) throw new Error(`Message with SHA ${sha} not found.`);

        messages = await utils.db.getConversationFromLeafMessage(leafMessage);
      }

      const newMessage: Message = {
        role,
        content
      };
      const newMessages = [...messages, newMessage];
      if (!isAtLeastOne(newMessages)) throw new Error("Unexpected codepoint reached."); // compilershutup for typing

      const processedMessages = await reprocessMessagesStartingFrom("gpt-4", newMessages);
      const newLeafMessage = processedMessages[processedMessages.length - 1].message;

      const persistedMessages = await utils.db.getConversationFromLeafMessage(newLeafMessage);

      const conversation = await buildParticipatedConversation(utils.db, persistedMessages, "gpt-4", []);
      const observeReplies = observeNewMessages(conversation).pipe(
        //tap(event => console.log("new message event", event)),
        filter(({role}  ) => role === "assistant")
      );

      const reply = await firstValueFrom(observeReplies);

      teardownConversation(conversation);
      return `
Reply SHA: ${reply.hash}

Content: ${reply.content}
      `.trim();
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
        description: "Must be one of either 'user' or 'system'. (defaults to 'user')",
        required: false
      },
      {
        name: "sha",
        type: "string",
        description: "The SHA of the message to append a user reply to. (defaults to starting a new conversation from the root rather than replying to an existing message)",
        required: false
      }
    ]
  },
  {
    name: "alert",
    description: "Displays a browser alert with the provided message.",
    implementation: async (_utils, message: string) => {
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
    implementation: (_utils, message: string, defaultValue?: string) => prompt(message, defaultValue) || "",
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
  }
];

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
        return acc;
      }, {} as any)
    },
    required: spec.parameters.filter((p) => p.required).map((p) => p.name)
  }));
}

export function isActiveFunction(conversation: Conversation, functionCall: FunctionCall) {
    return conversation.functions.some((f) => f.name === functionCall.name);
}

export async function callFunction(conversation: Conversation, functionCall: FunctionCall, db: ConversationDB): Promise<void> {
  if (!isActiveFunction(conversation, functionCall)) return;

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

    const result = code({db});

    const saveFunctionResult = async (resultString: string, completed: boolean) => {
      if (completed) {
        return db.saveFunctionResult({
          uuid,
          functionName: functionCall.name,
          completed: true
        })
      }

      return db.saveFunctionResult({
        uuid,
        functionName: functionCall.name,
        result: resultString,
        completed: false
      });
    };

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

    await saveFunctionResult(await result, false);
    await saveFunctionResult('', true);
  } catch (error) {
    console.error("caught error in callFunction", error);
    throw error;
  }
}

export function generateCodeForFunctionCall(functionCall: FunctionCall): (utils: FunctionUntils) => string | Promise<string> | Observable<string>{
  // Find the function spec for the called function
  const funcSpec = functionSpecs.find(func => func.name === functionCall.name);
  if (!funcSpec) {
    throw new Error(`Function "${functionCall.name}" not found in specs.`);
  }

  // Construct the ordered arguments list
  const args = funcSpec.parameters.map(param => {
    if (param.name in functionCall.parameters) {
      const value = functionCall.parameters[param.name];
      if (param.type === "number") return Number(value);
      if (param.type === "boolean") return Boolean(value);
      if (param.type === "string") return String(value);
      else throw new Error(`Unsupported parameter type "${param.type}" for parameter "${param.name}".`); // Just add handling for the unknown type directly above this line
    } else if (param.required) {
      throw new Error(`Required parameter "${param.name}" missing in function call.`);
    } else {
      return undefined; // Default value for optional parameters not provided in the call
    }
  });

  return (utils: FunctionUntils): string | Promise<string> | Observable<string> => {
    return funcSpec.implementation(utils, ...args);
  };
}

export type FunctionMessageContent = {
  uuid: string;
  v: number;
  name: string;
  parameters: FunctionParameters;
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

async function getFunctionResultsFromMessage(db: ConversationDB, message: MessageDB): Promise<FunctionResultDB[] | null> {
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

export function embellishFunctionMessages(db: ConversationDB): OperatorFunction<MessageDB, MessageDB> {
  return (source: Observable<MessageDB>): Observable<MessageDB> => {
    return source.pipe(
      concatMap(message => {
        const promise = embellishFunctionMessage(db, message).then(embellishedMessage => embellishedMessage || message);
        return from(promise);
      })
    );
  };
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
  return `
**function**: ${createCodeBlock(invocation.name)}

${Object.entries(invocation.parameters).map(([key, value]) => `**${key}**: ${createCodeBlock(typeof(value) === "string" ? value : JSON.stringify(value))}`).join("\n")}

${results.length === 0 ? "Function call incomplete..." : results.map((result) => {
if (result.completed) return "Function call complete."

const contents = createCodeBlock(result.result);
return `Result: ${contents}`
}).join("\n")}
  `.trim();
}
