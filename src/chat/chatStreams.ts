import { BehaviorSubject, Observable, Subject, concat, filter, map } from "rxjs";
import { FunctionCallMetadata, FunctionOption, getChatCompletion } from "../openai_api";
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { isTruthy } from "../tsUtils";

export type chatCompletionStream = {
  typingStream: Subject<string>,
  functionCallStream: Subject<GPTFunctionCall>
}

export type GPTTextUpdate = {
  text: string
}

export type GPTFunctionCall = {
  functionCall: FunctionCallMetadata
}

export type GPTSentMessage = {
  text: string,
  stopReason: "stop" | "length"
}

export type SupportedModels = "gpt-3.5-turbo" | "gpt-4" | "gpt-3.5-turbo-0613" | "gpt-4-0613" | "gpt-4-1106-preview";

export function isGPTFunctionCall(message: GPTMessage): message is GPTFunctionCall {
  return "functionCall" in message;
}

export function isGPTTextUpdate(message: GPTMessage): message is GPTTextUpdate {
  return "text" in message && !("stopReason" in message);
}

export function isGPTSentMessage(message: GPTMessage): message is GPTSentMessage {
  return "stopReason" in message;
}

export type GPTMessage = GPTTextUpdate | GPTFunctionCall | GPTSentMessage;

// Adjust the model based on the functions array length
function adjustModel(model: SupportedModels, functions: FunctionOption[]): SupportedModels {
  if (model === "gpt-4") return "gpt-4-1106-preview"; // gpt-4-turbo

  if (functions.length > 0) {
    //if (model === "gpt-4") return "gpt-4-0613";
    if (model === "gpt-3.5-turbo") return "gpt-3.5-turbo-0613";
  }
  return model;
}

export function chatCompletionMetaStream(
  messages: ChatCompletionMessageParam[],
  temperature: number,
  model: SupportedModels = "gpt-4",
  maxTokens: number,
  functions: FunctionOption[] = []
): Observable<GPTMessage> {
  model = adjustModel(model, functions);

  const typingStream = new Subject<string>();
  const functionCallStream = new BehaviorSubject<GPTFunctionCall | null>(null);
  const sentMessageStream = new BehaviorSubject<GPTSentMessage | null>(null);

  getChatCompletion(
    messages,
    temperature,
    model,
    maxTokens,
    functions,
    partialText => typingStream.next(partialText),
    functionCall => functionCallStream.next({ functionCall }),
    text => sentMessageStream.next({ text, stopReason: "stop" }),
    text => sentMessageStream.next({ text, stopReason: "length" })
  ).then(() => {
    typingStream.complete();
    sentMessageStream.complete();
    functionCallStream.complete();
  }).catch((err) => {
    console.error('Error during chat completion:', err);
    typingStream.error(err);
    sentMessageStream.complete();
    functionCallStream.complete();
  });

  return concat(
    typingStream.pipe(
      map(text => ({ text } as GPTTextUpdate))
    ),
    sentMessageStream.pipe(
      filter(isTruthy)
    ),
    functionCallStream.pipe(
      filter(isTruthy)
    ),
  );
}

