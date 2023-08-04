import { Observable, ReplaySubject, Subject, concat, first, from, map, merge, takeUntil } from "rxjs";

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

export type GPTMessage = GPTTextUpdate | GPTStopReason | GPTFunctionCall

export function chatCompletionStreams(
  messages: ChatMessage[],
  temperature: number,
  model = "gpt-4",
  functions: FunctionOption[],
  cancelStream = new Observable<void>()
): chatCompletionStream {
  const typingInputStream = new Subject<string>();
  const typingStream = new Subject<string>();
  const sendingStream = new ReplaySubject<void>(1);
  const internalCancelStream = new Subject<void>();
  const functionCallInputStream = new Subject<GPTFunctionCall>();
  const functionCallStream = new Subject<GPTFunctionCall>();

  cancelStream.pipe(
    takeUntil(internalCancelStream)
  ).subscribe(internalCancelStream);

  const finishObserver = from(getChatCompletion(
    messages,
    temperature,
    model,
    functions,
    partialText => typingInputStream.next(partialText),
    functionCall => functionCallInputStream.next({ functionCall })
  ));

  typingInputStream.pipe(
    takeUntil(internalCancelStream)
  ).subscribe(typingStream);

  functionCallInputStream.pipe(
    takeUntil(internalCancelStream)
  ).subscribe(functionCallStream);

  const limitedSendingStream = finishObserver.pipe(
    takeUntil(internalCancelStream)
  );
  limitedSendingStream.subscribe(internalCancelStream);
  limitedSendingStream.subscribe(sendingStream);

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
  functions: FunctionOption[],
  cancelStream = new Observable<void>()
): Observable<GPTMessage> {
  const { typingStream, sendingStream, functionCallStream } = chatCompletionStreams(
    messages,
    temperature,
    model,
    functions,
    cancelStream
  )

  const typingAndFunctionCallStream = merge(
    typingStream.pipe(
      map(text => ({ text } as GPTTextUpdate)),
    ),
    functionCallStream
  );

  return concat(
    typingAndFunctionCallStream,
    sendingStream.pipe(
      map(() => ({ stopReason: "stop" } as GPTStopReason)) // TODO: implement actually checking the stop reason
    )
  );
}
