import { EMPTY, Observable, Subject, UnaryFunction, catchError, concatMap, distinctUntilChanged, filter, from, map, merge, share, switchMap, tap, throwError } from "rxjs";
import { Conversation, Message, TypingUpdate, sendError } from "./conversation";
import { sendMessage, typeMessage } from "./participantSubjects";
import { GPTMessage, chatCompletionMetaStream, isGPTFunctionCall, isGPTTextUpdate, isGPTSentMessage, SupportedModels } from "./chatStreams";
import { ChatMessage, FunctionOption } from "../openai_api";
import { callFunction, isActiveFunction, possiblyEmbellishedMessageToMarkdown } from "./functionCalling";
import { ConversationDB, isMessageDB } from "./conversationDb";

// This is an odd solution to a very tricky problem with vanilla cold observables.
// Cold observables don't start consuming their source until they get a subscriber,
// and each subscriber leads to a new execution context, which means any side effects get duplicated.
// Instead, this immediately "connects" to a new Subject and uses that as a bus of sorts between
// all the different subscribers, if any.
// Beware that any buffered/queued/replayed/behaviorsubject'd pending values may be lost, but that's
// sometimes better than the alternative of subscriptions causing a side effect on the source observable
function hotShare<T>(): UnaryFunction<Observable<T>, Observable<T>> {
  return share({
    connector: () => new Subject(),
    resetOnError: false,
    resetOnComplete: false,
    resetOnRefCountZero: false
  });
}

async function messagesToConversationMessages(db: ConversationDB, messages: Message[]): Promise<ChatMessage[]> {
  const convertedMessagesPromises = messages.map(message => {
    if (!isMessageDB(message)) return Promise.resolve(message);

    // TODO: Human-oriented markdown may not be the most appropriate format for the assistant to use internally.
    // However, it's a good starting point for now and we can come back to this as time permits.
    return possiblyEmbellishedMessageToMarkdown(db, message).then(content => ({role: message.role, content}));
  });

  return Promise.all(convertedMessagesPromises);
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

export function addAssistant(
  conversation: Conversation,
  db: ConversationDB
): Conversation {
  if (conversation.model === "paused") return conversation;

  const messagesAndTyping = conversation.outgoingMessageStream.pipe(
    map(({messages, typingStatus}) => [messages, {role: "assistant", content: typingStatus.get("assistant") ?? ""}] as [Message[], TypingUpdate]),
    distinctUntilChanged(([messagesA, _typingA], [messagesB, _typingB]) => messagesA === messagesB)
  );

  const newSystemMessages = filterByIsSystemMessage(messagesAndTyping);
  const newUninterruptingUserMessages = filterByIsUninterruptingUserMessage(messagesAndTyping);

  const newRespondableMessages = merge(newUninterruptingUserMessages, newSystemMessages).pipe(
    map(([messages, _typing]) => messages)
  );

  const typingAndSending = switchedOutputStreamsFromRespondableMessages(db, newRespondableMessages, conversation.model, conversation.functions)
    .pipe(
      catchError(err => {
        console.error("Error from before handleGptMessages!", err);
        sendError(conversation, err);
        return EMPTY;
      })
    );

  handleGptMessages(conversation, typingAndSending, db);

  return conversation;
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

function filterByIsUninterruptingUserMessage(messagesAndTyping: Observable<[Message[], TypingUpdate]>): Observable<[Message[], TypingUpdate]> {
  return messagesAndTyping.pipe(
    filter(([messages, typing]) => {
      return messages.length > 0
      &&
      messages[messages.length - 1].role === "user"
      &&
      typing.content.length === 0
    }
    )
  )
}

function switchedOutputStreamsFromRespondableMessages(
  db: ConversationDB,
  newRespondableMessages: Observable<Message[]>,
  model?: SupportedModels,
  functions?: FunctionOption[],
) {
  return newRespondableMessages.pipe(
    rateLimiter(5, 5000),
    switchMap(messages => {
      const convertedMessagesPromise = messagesToConversationMessages(db, messages);
      return from(convertedMessagesPromise).pipe(
        concatMap(convertedMessages => chatCompletionMetaStream(convertedMessages, 0.1, model, 1000, functions))
      )
    }),
    hotShare() // NB: necessary to avoid inducing a separate stream for each subscriber
  )
}

function handleGptMessages(conversation: Conversation, typingAndSending: Observable<GPTMessage>, db: ConversationDB) {
  // TODO: The behavior here seems fine, but I would like to try to reorganize the agent code to be more of a pipeline
  // which terminates with every event being fed into the conversation input, rather than arbitrarily mixing in calls to
  // sendMessage, typeMessage, sendError, etc. It may make sense to try to change the behavior of those functions to
  // return events, rather than send events to the conversation directly from within the function, which is pretty side-effecty.
  // Side effects which begin and end as new messages to a stream are forgiveable for now though.

  typingAndSending.pipe(
    concatMap((message) => {
      try {
        if (isGPTTextUpdate(message)) {
          typeMessage(conversation, "assistant", message.text);
          return EMPTY;
        }

        if (isGPTSentMessage(message)) {
          sendMessage(
            conversation,
            "assistant",
            message.stopReason === "length" ? message.text + "[terminated due to length]" : message.text,
          );
          return EMPTY;
        }

        if (isGPTFunctionCall(message)) {
          if (!isActiveFunction(conversation, message.functionCall)) return EMPTY;

          return from(callFunction(conversation, message.functionCall, db));
        }

        console.warn("Unknown message type", message);
        return EMPTY;
      } catch (err) {
        console.error("Error during handleGptMessages", err);
        return throwError(() => err);
      }
    }),
    catchError(err => {
      console.error("Error from handleGptMessages catchError!", err);
      sendError(conversation, err);
      return EMPTY;
    })
  ).subscribe();
}
