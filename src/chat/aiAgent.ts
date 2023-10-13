import { EMPTY, Observable, Subject, UnaryFunction, catchError, concatMap, distinctUntilChanged, filter, from, map, merge, share, switchMap, tap, throwError } from "rxjs";
import { Conversation, Message, TypingUpdate, sendError, sendSystemMessage } from "./conversation";
import { sendMessage, typeMessage } from "./participantSubjects";
import { GPTMessage, chatCompletionMetaStream, isGPTFunctionCall, GPTFunctionCall, isGPTTextUpdate, isGPTSentMessage, SupportedModels } from "./chatStreams";
import { ChatMessage, FunctionOption } from "../openai_api";
import { callFunction } from "./functionCalling";
import { ConversationDB } from "./conversationDb";

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
  const newUninterruptingUserMessages = filterByIsUninterruptedUserMessage(messagesAndTyping);
  const newInterruptingUserMessages = filterByIsInterruptingUserMessage(messagesAndTyping);

  const newRespondableMessages = merge(newUninterruptingUserMessages, newSystemMessages).pipe(
    map(([messages, _typing]) => messages)
  );

  const typingAndSending = switchedOutputStreamsFromRespondableMessages(newRespondableMessages, conversation.model, conversation.functions)
    .pipe(
      catchError(err => {
        console.log("Error from before handleGptMessages!", err);
        sendError(conversation, err);
        return EMPTY;
      })
    );

  handleGptMessages(conversation, typingAndSending, db);

  // TODO: The way that I'm using naming to constrain which stream contains what data seems wrong. It'd be worth exploring
  // whether there's a way to leverage the type system to make this less brittle.
  const interruptingFunctionCalls = switchedOutputStreamsFromInterruptingUserMessages(newInterruptingUserMessages)
    .pipe(
      catchError(err => {
        console.log("Error from before sendSystemMessagesForInterruptions!", err);
        sendError(conversation, err);
        return EMPTY;
      })
    );

  sendSystemMessagesForInterruptions(conversation, interruptingFunctionCalls);

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

function filterByIsUninterruptedUserMessage(messagesAndTyping: Observable<[Message[], TypingUpdate]>): Observable<[Message[], TypingUpdate]> {
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
  newRespondableMessages: Observable<Message[]>,
  model?: SupportedModels,
  functions?: FunctionOption[]
) {
  return newRespondableMessages.pipe(
    rateLimiter(5, 5000),
    switchMap(messages => chatCompletionMetaStream(messages.map(({role, content}) => ({role, content})), 0.1, model, 1000, functions)),
    hotShare() // TODO: come back to whether this is the right way to do this
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
      console.log("Error from handleGptMessages catchError!", err);
      sendError(conversation, err);
      return EMPTY;
    })
  ).subscribe();
}

function switchedOutputStreamsFromInterruptingUserMessages(newInterruptingUserMessages: Observable<[Message[], TypingUpdate]>) {
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
    hotShare()
  )
}

function sendSystemMessagesForInterruptions(conversation: Conversation, interruptingFunctionCalls: Observable<[GPTFunctionCall, TypingUpdate]>) {
  interruptingFunctionCalls.pipe(
    filter(([{ functionCall }, _typingUpdate]) => functionCall.name === "cancel"),
    tap(() => sendSystemMessage(conversation, "Assistant was interrupted by the user and the message in progress was discarded."))
  ).subscribe();

  interruptingFunctionCalls.pipe(
    filter(([{ functionCall }, typingUpdate]) => functionCall.name === "append"),
    tap(([_, typingUpdate]) => sendSystemMessage(conversation, `Assistant was interrupted by the user. The message in progress was:
\`\`\`
${typingUpdate.content}
\`\`\`

Your message MUST be a continuation of this message in progress, but MUST also include a rapid pivot to fit with the most recent user messages. Do not duplicate the message in progress in the new message.`
    ))
  ).subscribe();
}
