import { BehaviorSubject, Observable, Subject, concat, filter, map } from "rxjs";
import { FunctionCallMetadata, getChatCompletion } from "../openai_api";
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { isTruthy } from "../tsUtils";
import { ConversationSettings } from "./conversation";

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

export function chatCompletionMetaStream(
  messages: ChatCompletionMessageParam[],
  temperature: number,
  maxTokens: number,
  settings: ConversationSettings,
): Observable<GPTMessage> {
  const typingStream = new Subject<string>();
  const functionCallStream = new BehaviorSubject<GPTFunctionCall | null>(null);
  const sentMessageStream = new BehaviorSubject<GPTSentMessage | null>(null);

  getChatCompletion(
    messages,
    temperature,
    maxTokens,
    settings,
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

