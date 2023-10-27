import { FunctionCall, FunctionOption, getEmbedding } from "../openai_api";
import { Conversation, Message, observeNewMessages, sendFunctionCall, teardownConversation } from "./conversation";
import { ConversationDB, MessageDB } from "./conversationDb";
import { v4 as uuidv4 } from "uuid";
import { reprocessMessagesStartingFrom } from "./messagePersistence";
import { filter, firstValueFrom, tap } from "rxjs";
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
  implementation: (...args: any[]) => Promise<string> | string;
  parameters: FunctionParameter[];
};

type FunctionUntils = {
  db: ConversationDB;
}

function concatWithEllipses(str: string, maxLength: number): string {
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}

function sharedSearchSpecBuilder(table: 'embeddings' | 'summaryEmbeddings', name: string, description: string) {
  return {
    name,
    description,
    implementation: async (utils: {db: ConversationDB}, query: string, limit: number, ancestor?: string) => {
      const { db } = utils;
      const embedding = await getEmbedding(query);
      const shaResults: string[] = await db.searchEmbedding(embedding, limit, table, ancestor); // TODO: stream of results instead?
      if (shaResults.length === 0) {
        return "No results found.";
      }
      else {
        const results: MessageDB[] = [];
        for (const sha of shaResults) {
          const message = await db.getMessageByHash(sha);
          if (message) {
            results.push(message);
          }
        }
        return results.map(message => `${message.hash}: ${concatWithEllipses(message.content.replace(/\n/g, ""), 60)}`).join("\n\n");
      }
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

      const newLeafMessage = await reprocessMessagesStartingFrom("gpt-4", newMessages);

      const persistedMessages = await utils.db.getConversationFromLeafMessage(newLeafMessage.message);

      const conversation = await buildParticipatedConversation(utils.db, persistedMessages, "gpt-4", []);
      const observeReplies = observeNewMessages(conversation).pipe(
        tap(event => console.log("new message event", event)),
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
    implementation: (_utils, message: string) => {
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
    console.log("eval!", code);

    const result = code({db});

    const prettifiedCall = `\`${functionCall.name}(${Object.entries(functionCall.parameters).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ")})\``;

    if (typeof result === "string") {
      const content = `
Call: ${prettifiedCall}

**Result:**
\`\`\`
${result}
\`\`\`
      `.trim();

      sendFunctionCall(conversation, content);
    }
    else {
      const uuid = uuidv4();
      const initialContent = `
Call: ${prettifiedCall}

Result: (pending: ${uuid})
        `.trim();
      sendFunctionCall(conversation, initialContent);
      const resultString = await result;
      const finalContent = `
Result (${uuid}):
\`\`\`
${resultString}
\`\`\`
        `.trim();
      sendFunctionCall(conversation, finalContent);
    }
  } catch (error) {
    console.error("caught error in callFunction", error);
    throw error;
  }
}

export function generateCodeForFunctionCall(functionCall: FunctionCall): (utils: FunctionUntils) => string | Promise<string> {
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

  return (utils: FunctionUntils): string | Promise<string> => {
    return funcSpec.implementation(utils, ...args);
  };
}
