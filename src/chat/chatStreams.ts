import { Observable, ReplaySubject, Subject, concat, from, map, merge, of } from "rxjs";
import { ChatMessage, FunctionCall, FunctionOption, getChatCompletion } from "../openai_api";

export type chatCompletionStream = {
  typingStream: Subject<string>,
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

  finishObserver.subscribe({
    error: (err) => {
      console.error('Error during chat completion:', err);

      // Send the error into the typingStream
      typingStream.error(err);

      // Complete the streams if necessary, or handle the error in another way.
      functionCallStream.complete();
    },
    complete: () => {
      typingStream.complete();
      functionCallStream.complete();
    }
  });

  return {
    typingStream,
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
  if (functions.length) {
    if (model === "gpt-4") model = "gpt-4-0613";
    if (model === "gpt-3.5-turbo") model = "gpt-3.5-turbo-0613";
  }

  const { typingStream, functionCallStream } = chatCompletionStreams(
    messages,
    temperature,
    model,
    maxTokens,
    functions
  )

  functionCallStream.subscribe((message) => {
    console.log("FUNCTION CALL", message)
  })

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
