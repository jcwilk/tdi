// a series of functions that will be used to create an AI agent

import { BehaviorSubject, Observable, Subject, UnaryFunction, combineLatest, combineLatestWith, debounceTime, filter, map, merge, mergeMap, multicast, partition, scan, share, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from "rxjs";
import { Conversation, Message, TypingUpdate, addParticipant, sendSystemMessage } from "./conversation";
import { Participant, createParticipant, sendMessage, subscribeWhileAlive, typeMessage } from "./participantSubjects";
import { GPTMessage, chatCompletionMetaStream, chatCompletionStreams, isGPTFunctionCall, GPTFunctionCall, isGPTTextUpdate, GPTTextUpdate, isGPTStopReason } from "./chatStreams";
import { ChatMessage, FunctionOption } from "../openai_api";

const mainSystemMessage: ChatMessage = {
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

function hotShare<T>(): UnaryFunction<Observable<T>, Observable<T>> {
  return share({
    connector: () => new Subject(),
    resetOnError: false,
    resetOnComplete: false,
    resetOnRefCountZero: false
  });
}

function hotShareUntil<T>(cancelStream: Observable<any>): UnaryFunction<Observable<T>, Observable<T>> {
  return (source: Observable<T>) => source.pipe(
    takeUntil(cancelStream),
    hotShare()
  );
}

function rateLimiter<T>(maxCalls: number, windowSize: number): (source: Observable<T>) => Observable<T> {
  return function(source: Observable<T>): Observable<T> {
      let timestamps: number[] = [];

      return new Observable<T>(observer => {
          return source.subscribe({
              next(value) {
                  const now = Date.now();
                  timestamps = timestamps.filter(timestamp => now - timestamp < windowSize);
                  if (timestamps.length >= maxCalls) {
                      observer.error(new Error(`Rate limit exceeded. Maximum allowed is ${maxCalls} calls within ${windowSize} milliseconds.`));
                  } else {
                      timestamps.push(now);
                      observer.next(value);
                  }
              },
              error(err) { observer.error(err); },
              complete() { observer.complete(); }
          });
      });
  };
}

function logStream(stream: Observable<any>, tag: string) {
  stream.subscribe((value) => {
    console.log(tag, value)
  });
}

export function addAssistant(
  conversation: Conversation
): Conversation {
  sendSystemMessage(conversation, mainSystemMessage.content);

  const assistant = createParticipant("assistant");

  conversation = addParticipant(conversation, assistant);

  const messages = createMessageStream(conversation, assistant);

  const messagesAndTyping = messages.pipe(
    withLatestFrom(assistant.typingStream),
    hotShareUntil(assistant.stopListening)
  );
  const newSystemMessages = filterByIsSystemMessage(messagesAndTyping);
  const newUninterruptedUserMessages = filterByIsUninterruptedUserMessage(messagesAndTyping);
  const newInterruptingUserMessages = filterByIsInterruptingUserMessage(messagesAndTyping);

  const newRespondableMessages = merge(newSystemMessages, newUninterruptedUserMessages).pipe(
    map(([messages, _typing]) => messages)
  );

  const typingAndSending = switchedOutputStreamsFromRespondableMessages(newRespondableMessages, assistant);
  handleGptMessages(assistant, conversation, typingAndSending);

  const interruptingFunctionCalls = switchedOutputStreamsFromInterruptingUserMessages(newInterruptingUserMessages, assistant);
  sendSystemMessagesForInterruptions(assistant, conversation, interruptingFunctionCalls);

  return conversation;
}

function createMessageStream(conversation: Conversation, assistant: Participant) {
  const messages = new BehaviorSubject<Message[]>([]);

  conversation.outgoingMessageStream.pipe(
    scan((allMessages: Message[], newMessage: Message) => [...allMessages, newMessage], []),
    filter((allMessages) => allMessages[allMessages.length - 1].participantId !== assistant.id),
    hotShareUntil(assistant.stopListening)
  ).subscribe(messages);

  return messages;
}

function filterByIsSystemMessage(messagesAndTyping: Observable<[Message[], TypingUpdate]>): Observable<[Message[], TypingUpdate]> {
  return messagesAndTyping.pipe(
    filter(([messages, _typing]) =>
      messages.length > 0
      &&
      messages[messages.length - 1].role === "system"
    )
  )
}

function filterByIsUninterruptedUserMessage(messagesAndTyping: Observable<[Message[], TypingUpdate]>): Observable<[Message[], TypingUpdate]> {
  return messagesAndTyping.pipe(
    filter(([messages, typing]) =>
      messages.length > 0
      &&
      messages[messages.length - 1].role === "user"
      &&
      typing.content.length === 0
    )
  )
}

function switchedOutputStreamsFromRespondableMessages(
  newRespondableMessages: Observable<Message[]>,
  assistant: Participant
) {
  return newRespondableMessages.pipe(
    rateLimiter(5, 5000),
    switchMap(messages => chatCompletionMetaStream(messages.map(({role, content}) => ({role, content})), 0.1, "gpt-4", 1000)),
    hotShareUntil(assistant.stopListening)
  )
}

function filterByIsInterruptingUserMessage(messagesAndTyping: Observable<[Message[], TypingUpdate]>): Observable<[Message[], TypingUpdate]> {
  return messagesAndTyping.pipe(
    filter(([messages, typing]) =>
      messages.length > 0
      &&
      messages[messages.length - 1].role === "user"
      &&
      typing.content.length > 0
    )
  )
}

function handleGptMessages(assistant: Participant, conversation: Conversation, typingAndSending: Observable<GPTMessage>) {
  const garbageCollectible = typingAndSending.pipe(
    takeUntil(assistant.stopListening)
  );

  garbageCollectible.pipe(
    filter(isGPTTextUpdate)
  ).subscribe((typing) => typeMessage(assistant, typing.text));

  garbageCollectible.pipe(
    filter(isGPTStopReason)
  ).subscribe(() => {sendMessage(assistant)});
}

function switchedOutputStreamsFromInterruptingUserMessages(newInterruptingUserMessages: Observable<[Message[], TypingUpdate]>, assistant: Participant) {
  return newInterruptingUserMessages.pipe(
    switchMap(([messages, typingUpdate]) => {
      const convertedMessages: ChatMessage[] = messages.filter(({ role }) => role !== "system").map(({ role, content }) => ({ role, content }));
      const systemInstructions: ChatMessage = { role: "system", content: `
You are a text generation monitor. The user has sent new messages while the text generation of the assistant was still in progress. The text generation in progress was:
\`\`\`
${typingUpdate.content}
\`\`\`

The only way to take the newest messages from the user into account is to either discard the message in progress (\`cancel\`) or to restart with new data but \`append\` to the message in progress.

The ONLY scenario where you should not call a function is if the latest user messages are already fully addressed by the message in progress. Return a blank string (\`""\`) in this case.
      `.trim() };
      // TODO: the conversation should be presented to GPT all in one message so it can differentiate the flow of the text generation monitoring conversation from the user conversation.
      // also would be easier to do few-shot examples of function call decisions if the conversation was presented to GPT all in one message.
      return chatCompletionMetaStream([systemInstructions, ...convertedMessages], 0.1, "gpt-3.5-turbo-0613", 100, interruptionFunctions).pipe(
        map(gptMessage => [gptMessage, typingUpdate] as [GPTMessage, TypingUpdate])
      )
    }),
    filter(([gptMessage, _typingUpdate]) => isGPTFunctionCall(gptMessage)),
    map(([gptMessage, typingUpdate]) => [gptMessage, typingUpdate] as [GPTFunctionCall, TypingUpdate]),
    hotShareUntil(assistant.stopListening)
  )
}

function sendSystemMessagesForInterruptions(assistant: Participant, conversation: Conversation, interruptingFunctionCalls: Observable<[GPTFunctionCall, TypingUpdate]>) {
  const garbageCollectible = interruptingFunctionCalls.pipe(
    takeUntil(assistant.stopListening)
  );

  garbageCollectible.pipe(
    filter(([{ functionCall }, _typingUpdate]) => functionCall.name === "cancel")
  ).subscribe(() => {
    sendSystemMessage(conversation, "Assistant was interrupted by the user and the message in progress was discarded.");
  });

  garbageCollectible.pipe(
    filter(([{ functionCall }, typingUpdate]) => functionCall.name === "append")
  ).subscribe(([_gptFunctionCall, typingUpdate]) => {
    sendSystemMessage(conversation, `Assistant was interrupted by the user. The message in progress was:
\`\`\`
${typingUpdate.content}
\`\`\`

Your message MUST be a continuation of this message in progress, but MUST also include a rapid pivot to fit with the most recent user messages. Do not duplicate the message in progress in the new message.
`);
  });
}
