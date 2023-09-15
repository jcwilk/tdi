import { FunctionCall, FunctionOption, getEmbedding } from "../openai_api";
import { Conversation, sendFunctionCall } from "./conversation";
import { ConversationDB, MessageDB } from "./conversationDb";
import { v4 as uuidv4 } from "uuid";
import { Participant, typeMessage } from "./participantSubjects";

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

const functionSpecs: FunctionSpec[] = [
  {
    name: "embedding_search",
    description: "Searches for the most similar embeddings to the provided query.",
    implementation: async (utils = {db: ConversationDB}, query: string, limit: number) => {
      const { db } = utils;
      const embedding = await getEmbedding(query);
      const shaResults: string[] = await db.searchEmbedding(embedding, limit); // TODO: stream of results instead?
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
        description: "The query to search for.",
        required: true
      },
      {
        name: "limit",
        type: "number",
        description: "The maximum number of results to return.",
        required: true
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

export async function callFunction(conversation: Conversation, functionCall: FunctionCall, db: ConversationDB, assistant: Participant): Promise<void> {
  if (!isActiveFunction(conversation, functionCall)) return;

  try {
    const code = generateCodeForFunctionCall(functionCall);
    console.log("eval!", code);

    const result = code({db});

    const prettifiedCall = `\`${functionCall.name}(${Object.entries(functionCall.parameters).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ")})\``;

    typeMessage(assistant, "")

    if (typeof result === "string") {
      const content = `
Call: ${prettifiedCall}

**Result:**
\`\`\`
${result}
\`\`\`
      `.trim();

      sendFunctionCall(conversation, functionCall, content);
    }
    else {
      const uuid = uuidv4();
      const initialContent = `
Call: ${prettifiedCall}

Result: (pending: ${uuid})
        `.trim();
      sendFunctionCall(conversation, functionCall, initialContent);
      const resultString = await result;
      const finalContent = `
Result (${uuid}):
\`\`\`
${resultString}
\`\`\`
        `.trim();
      sendFunctionCall(conversation, functionCall, finalContent);
    }
  } catch (error) {
    console.error(error);
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
      return JSON.stringify(functionCall.parameters[param.name]); // Ensuring strings are properly quoted
    } else if (param.required) {
      throw new Error(`Required parameter "${param.name}" missing in function call.`);
    } else {
      return undefined; // Default value for optional parameters not provided in the call
    }
  });

  // TODO: as-is this works only for functions that are defined in the global scope
  // we need to figure out a way to give this access to trickier functions, like ones that require access to the db
  // I'm thinking we can do this by making a special simplified function which already has all the prereq stuff loaded in
  // so the interface that the agent needs to interact with is minimized
  //return `${functionCall.name}(${args.join(", ")})`;

  return (utils: FunctionUntils): string | Promise<string> => {
    return funcSpec.implementation(utils, ...args);
  };
}
