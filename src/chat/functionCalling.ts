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

  const code = `${functionCall.name}("${functionCall.parameters.message}")`;
  console.log("eval!", code)

  const result = eval(code);

  sendFunctionCall(conversation, functionCall, result);
}
