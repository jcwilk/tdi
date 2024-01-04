import { EMPTY, Observable, Subject, UnaryFunction, catchError, concatMap, distinctUntilChanged, filter, firstValueFrom, from, map, merge, share, switchMap, tap, throwError } from "rxjs";
import { Conversation, ConversationState, Message, TypingUpdate, sendError } from "./conversation";
import { sendMessage, typeMessage } from "./participantSubjects";
import { GPTMessage, chatCompletionMetaStream, isGPTFunctionCall, isGPTTextUpdate, isGPTSentMessage, SupportedModels } from "./chatStreams";
import { ChatMessage, FunctionOption, isToolFunctionCall } from "../openai_api";
import { callFunction, isActiveFunction, possiblyEmbellishedMessageToMarkdown } from "./functionCalling";
import { ConversationDB, ConversationMessages, isBasicPersistedMessage, isFunctionResultWithResult } from "./conversationDb";
import { ChatCompletionAssistantMessageParam, ChatCompletionFunctionMessageParam, ChatCompletionMessageParam, ChatCompletionMessageToolCall, ChatCompletionToolMessageParam } from "openai/resources/chat/completions";

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

async function messagesToConversationMessages(messages: ConversationMessages): Promise<ChatCompletionMessageParam[]> {
  const convertedMessagesPromises = messages.map(async message => {
    if (isBasicPersistedMessage(message)) return {role: message.role, content: message.content};

    const resultsWithCompletion = await firstValueFrom(message.results);
    const resultsOnly = resultsWithCompletion.filter(isFunctionResultWithResult);
    const results = {
      results: resultsOnly.map(result => result.result),
      state: (resultsWithCompletion.length === resultsOnly.length) ? "completed" : "incomplete"
    };

    if (isToolFunctionCall(message.functionCall)) {
      const toolCalls: ChatCompletionMessageToolCall[] = [{id: message.functionCall.id, type: 'function', function: {name: message.functionCall.name, arguments: JSON.stringify(message.functionCall.parameters)}}];
      const assistantToolCall: ChatCompletionAssistantMessageParam = {role: "assistant", tool_calls: toolCalls};
      const toolMessage: ChatCompletionToolMessageParam = {role: "tool", content: JSON.stringify(results), tool_call_id: message.functionCall.id};
      return [assistantToolCall, toolMessage];
    }

    const functionMessage: ChatCompletionFunctionMessageParam = {role: "function", content: JSON.stringify({...results, arguments: message.functionCall.parameters}), name: message.functionCall.name};
    return functionMessage;
  });

  return (await Promise.all(convertedMessagesPromises)).flat();
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
    map<ConversationState,[ConversationMessages,TypingUpdate]>(({messages, typingStatus}) => [messages, {role: "assistant", content: typingStatus.get("assistant") ?? ""}]),
    distinctUntilChanged(([messagesA, _typingA], [messagesB, _typingB]) => messagesA.length === messagesB.length)
  );

  const newSystemMessages = filterByIsSystemMessage(messagesAndTyping);
  const newUninterruptingUserMessages = filterByIsUninterruptingUserMessage(messagesAndTyping);

  const newRespondableMessages = merge(newUninterruptingUserMessages, newSystemMessages).pipe(
    map(([messages, _typing]) => messages)
  );

  const typingAndSending = switchedOutputStreamsFromRespondableMessages(newRespondableMessages, conversation.model, conversation.functions)
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

function filterByIsSystemMessage(messagesAndTyping: Observable<[ConversationMessages, TypingUpdate]>): Observable<[ConversationMessages, TypingUpdate]> {
  return messagesAndTyping.pipe(
    filter(([messages, _typing]) =>
      messages[messages.length - 1].role === "system"
    )
  )
}

function filterByIsUninterruptingUserMessage(messagesAndTyping: Observable<[ConversationMessages, TypingUpdate]>): Observable<[ConversationMessages, TypingUpdate]> {
  return messagesAndTyping.pipe(
    filter(([messages, typing]) => {
      return messages[messages.length - 1].role === "user"
      &&
      typing.content.length === 0
    }
    )
  )
}

function switchedOutputStreamsFromRespondableMessages(
  newRespondableMessages: Observable<ConversationMessages>,
  model?: SupportedModels,
  functions?: FunctionOption[],
) {
  return newRespondableMessages.pipe(
    rateLimiter(5, 5000),
    switchMap(messages => {
      const convertedMessagesPromise = messagesToConversationMessages(messages);
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
