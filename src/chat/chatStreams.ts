import { Observable, Subject, first, from, takeUntil } from "rxjs";
import { ChatMessage } from "../scenarios";
import { getChatCompletion } from "../openai_api";

export type chatCompletionStream = {
  typingStream: Subject<string>,
  sendingStream: Subject<void>
}

export function chatCompletionStreams(
  messages: ChatMessage[],
  temperature: number,
  model = "gpt-4",
  cancelStream = new Observable<void>()
): chatCompletionStream {
  const typingInputStream = new Subject<string>();
  const typingStream = new Subject<string>();
  const sendingStream = new Subject<void>();
  const internalCancelStream = new Subject<void>();

  cancelStream.pipe(
    takeUntil(internalCancelStream)
  ).subscribe(internalCancelStream);

  const finishObserver = from(getChatCompletion(
    messages,
    temperature,
    model,
    partialText => typingInputStream.next(partialText)
  ));

  typingInputStream.pipe(
    takeUntil(internalCancelStream)
  ).subscribe(typingStream);

  const limitedSendingStream = finishObserver.pipe(
    takeUntil(internalCancelStream)
  );
  limitedSendingStream.subscribe(internalCancelStream);
  limitedSendingStream.subscribe(sendingStream);

  return {
    typingStream,
    sendingStream
  }
}
