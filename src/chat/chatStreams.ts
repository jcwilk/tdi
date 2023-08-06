import { Observable, ReplaySubject, Subject, concat, first, from, map, merge, of, shareReplay, takeUntil } from "rxjs";

import { ChatMessage, FunctionCall, FunctionOption, getChatCompletion } from "../openai_api";

export type chatCompletionStream = {
  typingStream: Subject<string>,
  sendingStream: ReplaySubject<void>,
  functionCallStream: Subject<GPTFunctionCall>
}

export type GPTTextUpdate = {
  text: string
}

export type GPTStopReason = {
  stopReason: "function_call" | "stop" | "length" | "content_filter"
}

export type GPTFunctionCall = {
  functionCall: FunctionCall
}

export function isGPTFunctionCall(message: GPTMessage): message is GPTFunctionCall {
  return "functionCall" in message;
}

export function isGPTTextUpdate(message: GPTMessage): message is GPTTextUpdate {
  return "text" in message;
}

export function isGPTStopReason(message: GPTMessage): message is GPTStopReason {
  console.log("isGPTStopReason", message, "stopReason" in message)
  return "stopReason" in message;
}

export type GPTMessage = GPTTextUpdate | GPTStopReason | GPTFunctionCall

export function chatCompletionStreams(
  messages: ChatMessage[],
  temperature: number,
  model = "gpt-4",
  maxTokens: number,
  functions: FunctionOption[]
): chatCompletionStream {
  const typingInputStream = new Subject<string>();
  const typingStream = new Subject<string>();
  const sendingStream = new ReplaySubject<void>(1);
  const functionCallInputStream = new Subject<GPTFunctionCall>();
  const functionCallStream = new Subject<GPTFunctionCall>();

  const finishObserver = from(getChatCompletion(
    messages,
    temperature,
    model,
    maxTokens,
    functions,
    partialText => typingInputStream.next(partialText),
    functionCall => functionCallInputStream.next({ functionCall })
  ));

  typingInputStream.subscribe(typingStream);

  functionCallInputStream.subscribe(functionCallStream);

  finishObserver.subscribe(sendingStream);
  finishObserver.subscribe(() => {
    typingStream.complete();
    functionCallStream.complete();
    sendingStream.complete();
  });


  return {
    typingStream,
    sendingStream,
    functionCallStream
  }
}

export function chatCompletionMetaStream(
  messages: ChatMessage[],
  temperature: number,
  model = "gpt-4",
  maxTokens: number,
  functions: FunctionOption[] = []
): Observable<GPTMessage> {
  const { typingStream, sendingStream, functionCallStream } = chatCompletionStreams(
    messages,
    temperature,
    model,
    maxTokens,
    functions
  )

  sendingStream.subscribe(val => console.log("sendingStream", val));

  const typingAndFunctionCallStream = merge(
    typingStream.pipe(
      map(text => ({ text } as GPTTextUpdate)),
    ),
    functionCallStream
  );

  return concat(
    typingAndFunctionCallStream,
    of({ stopReason: "stop" } as GPTStopReason) // TODO: implement actually checking the stop reason
  );
}
