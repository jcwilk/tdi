// a series of functions that will be used to create an AI agent

import { BehaviorSubject, Observable, Subject, debounceTime, filter, map, mergeMap, partition, scan, startWith, switchMap, takeUntil, tap, withLatestFrom } from "rxjs";
import { Conversation, Message, addParticipant } from "./conversation";
import { Participant, createParticipant, sendMessage, subscribeWhileAlive, typeMessage } from "./participantSubjects";
import { GPTMessage, chatCompletionMetaStream, chatCompletionStreams, isGPTFunctionCall, GPTFunctionCall } from "./chatStreams";
import { ChatMessage, FunctionOption } from "../openai_api";

const systemMessage: ChatMessage = {
  role: "system",
  content: `
You are an AI conversationalist. Your job is to converse with the user. Your prose, grammar, spelling, typing, etc should all be consistent with typical instant messaging discourse within the constraints of needing to put your entire response into one message to send each time. Use natural grammar rather than perfect grammar.
  `
}

const interruptionFunctions: FunctionOption[] = [
  {
    "name": "append",
    "description": "Interrupt the current typing stream and induce the next message to be appended to the current message",
    "parameters": {
        "type": "object",
        "properties": {}
    },
  },
  {
    "name": "cancel",
    "description": "Interrupt the current typing stream and induce the next message to be a new message",
    "parameters": {
      "type": "object",
      "properties": {}
    },
  }
]

function isPairWithGPTFunctionCall(pair: [string, GPTMessage]): pair is [string, GPTFunctionCall] {
  return isGPTFunctionCall(pair[1]);
}

//returns an object with a conversation and a participant
export function addAssistant(conversation: Conversation): { conversation: Conversation, assistant: Participant } {
  const assistant = createParticipant("assistant");
  const addedConvo = addParticipant(conversation, assistant);

  const rawMessages = new Subject<Message>();

  const messages = new BehaviorSubject<ChatMessage[]>([]);

  rawMessages.pipe(
    map(({ role, content }) => ({ role, content })),
    scan((acc: ChatMessage[], message: ChatMessage) => [...acc, message], [])
  ).subscribe(messages);

  subscribeWhileAlive(assistant, addedConvo.outgoingMessageStream, rawMessages);

  const gptTrigger = new Subject<Message>();

  // filter out messages that are from the assistant and then debounce
  const debouncedFilteredOutput = rawMessages.pipe(
    filter(({ participantId }) => participantId !== assistant.id ),
    debounceTime(500)
  );
  subscribeWhileAlive(assistant, debouncedFilteredOutput, gptTrigger);

  const assistantConvoTyping = new BehaviorSubject<string>("");
  addedConvo.typingAggregationOutput.pipe(map((typingAggregation) => typingAggregation.get(assistant.id) || "")).subscribe(assistantConvoTyping);

  const triggeredTypingWithMessages = gptTrigger.pipe(
    map(() => assistantConvoTyping.value),
    withLatestFrom(messages)
  )

  const [interruptedStream, uninterruptedStream] = partition(triggeredTypingWithMessages, ([interruptedMessage, _]) => interruptedMessage.length > 0);

  const interruptedStreamFunctionCalls = interruptedStream.pipe(
    mergeMap(([interruptedMessage, messages]) => chatCompletionMetaStream( // TODO: include an additional, optional `functions` parameter, see https://platform.openai.com/docs/guides/gpt/function-calling
      [{role: "system", content: "Your only job is to decide whether to interrupt the message in progress or not. Here's the message in progress by the assistant, you can let him finish or interrupt: "+interruptedMessage}, ...messages],
      0.1,
      "gpt-3.5-turbo-0613",
      interruptionFunctions,
      assistant.stopListening
    ).pipe(
      map(message => [interruptedMessage, message] as [string, GPTMessage]),
      tap(([interruptedMessage, message]) => console.log("interruptedMessage", interruptedMessage, "message", message))
    )),
    filter(isPairWithGPTFunctionCall),
    tap(([interruptedMessage, message]) => console.log("interruptedMessage2", interruptedMessage, "message", message))
  );

  const startedTypingNewMessage = new Subject<void>();
  const cancelCurrentMessage = new Subject<void>();

  const interruptedStreamFunctionCallsForCurrentMessage = startedTypingNewMessage.pipe(
    switchMap(() => interruptedStreamFunctionCalls)
  );

  interruptedStreamFunctionCallsForCurrentMessage.subscribe({
    next: ([interruptedMessage, { functionCall }]) => {
      console.log("interruptedMessage", interruptedMessage);
    }
  })

  interruptedStreamFunctionCallsForCurrentMessage.pipe(
    filter(([_, { functionCall }]) => functionCall.name === "cancel"),
    map(() => {console.log("cancelled!"); return messages.value})
  ).subscribe({
    next: (messages) => {
      cancelCurrentMessage.next();
      startedTypingNewMessage.next();
      typeAndSendNewMessage(assistant, [systemMessage, ...messages], cancelCurrentMessage);
    }
  })

  interruptedStreamFunctionCallsForCurrentMessage.pipe(
    filter(([_, { functionCall }]) => functionCall.name === "append"),
    map(([interruptedMessage, _]) => [interruptedMessage, messages.value] as [string, ChatMessage[]])
  ).subscribe({
    next: ([interruptedMessage, messages]) => {
      cancelCurrentMessage.next();
      startedTypingNewMessage.next();
      typeAndSendNewMessage(assistant,
        [
          systemMessage,
          ...messages,
          {
            role: "system",
            content: `You were interrupted by recent messages, your message so far which your next message will be automatically appended to is: ${interruptedMessage}`
          }
        ],
        cancelCurrentMessage
      );
    }
  })

  uninterruptedStream.subscribe({
    next: ([interruptedMessage, messages]) => {
      startedTypingNewMessage.next();
      typeAndSendNewMessage(assistant, [systemMessage, ...messages], cancelCurrentMessage);
    }
  });

  return { conversation: addedConvo, assistant };
}

function typeAndSendNewMessage(assistant: Participant, messages: ChatMessage[], cancelStream: Observable<void>) {
  const completionPackage = chatCompletionStreams(
    messages,
    0.1,
    "gpt-3.5-turbo",
    [],
    cancelStream
  )

  completionPackage.typingStream.subscribe({
    next: (partialText) => typeMessage(assistant, partialText)
  });

  completionPackage.sendingStream.subscribe({
    next: () => sendMessage(assistant)
  });
}
