import { FunctionCall, FunctionOption } from "../openai_api";
import { Conversation, sendFunctionCall } from "./conversation";

type FunctionParameter = {
  name: string;
  type: string;
  description: string;
  required: boolean;
};

type FunctionSpec = {
  name: string;
  description: string;
  implementation: (...args: any[]) => any;
  parameters: FunctionParameter[];
};

const functionSpecs: FunctionSpec[] = [
  {
    name: "alert",
    description: "Displays a browser alert with the provided message.",
    implementation: (message: string) => alert(message),
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
    implementation: (message: string, defaultValue?: string) => prompt(message, defaultValue),
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

export function callFunction(conversation: Conversation, functionCall: FunctionCall): void {
  if (!isActiveFunction(conversation, functionCall)) return;

  try {
    const code = generateCodeForFunctionCall(functionCall);
    console.log("eval!", code);

    const result = eval(code);

    sendFunctionCall(conversation, functionCall, result);
  } catch (error) {
    console.error(error);
  }
}

export function generateCodeForFunctionCall(functionCall: FunctionCall): string {
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

  return `${functionCall.name}(${args.join(", ")})`;
}
