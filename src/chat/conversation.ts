import { BehaviorSubject, Observable, Subject, concatMap, distinctUntilChanged, filter, from, map, scan } from 'rxjs';
import { ParticipantRole, TyperRole, isTyperRole, sendMessage } from './participantSubjects';
import { ConversationDB, ConversationMessages, MessageDB } from './conversationDb';
import { MaybeProcessedMessageResult, processMessagesWithHashing, reprocessMessagesStartingFrom } from './messagePersistence';
import { FunctionOption } from '../openai_api';
import { scanAsync, subscribeUntilFinalized } from './rxjsUtilities';
import { SupportedModels } from './chatStreams';
import { isAtLeastOne } from '../tsUtils';

export type Message = {
  role: ParticipantRole;
  content: string;
};

export type TypingUpdate = {
  role: TyperRole;
  content: string;
}

export type ErrorMessageEvent = {
  type: 'errorMessage';
  payload: Message;
};

export type NewMessageEvent = {
  type: 'newMessage';
  payload: Message;
};

export type ProcessedMessageEvent = {
  type: 'processedMessage';
  payload: MessageDB;
};

export type TypingUpdateEvent = {
  type: 'typingUpdate';
  payload: TypingUpdate;
};

export type ConversationEvent = ErrorMessageEvent | TypingUpdateEvent | NewMessageEvent | ProcessedMessageEvent;

function isErrorMessageEvent(event: ConversationEvent): event is ErrorMessageEvent {
  return event.type === 'errorMessage';
}

function isNewMessageEvent(event: ConversationEvent): event is NewMessageEvent {
  return event.type === 'newMessage';
}

export type ConversationState = {
  messages: ConversationMessages;
  typingStatus: Map<TyperRole, string>;
};

export type ConversationModel = SupportedModels & ("gpt-3.5-turbo" | "gpt-4")

export type ConversationMode = ConversationModel | "paused";

export function isConversationMode(mode: string): mode is ConversationMode {
  return ["gpt-3.5-turbo", "gpt-4", "paused"].includes(mode);
}

export type Conversation = {
  newMessagesInput: Subject<ConversationEvent>;
  outgoingMessageStream: BehaviorSubject<ConversationState>;
  functions: FunctionOption[];
  model: ConversationMode;
};

interface ScanState {
  lastResult: MaybeProcessedMessageResult;
  event: TypingUpdateEvent | ProcessedMessageEvent | null;
}

export async function createConversation(db: ConversationDB, loadedMessages: ConversationMessages, model: ConversationMode = 'gpt-3.5-turbo', functions: FunctionOption[] = []): Promise<Conversation> {
  const processedResults = await reprocessMessagesStartingFrom(model, loadedMessages);

  const processedMessages = processedResults.map(result => result.message);
  if (!isAtLeastOne(processedMessages)) throw new Error("No messages in conversation"); // just compilershutup
  loadedMessages = processedMessages;

  const conversation: Conversation = {
    newMessagesInput: new Subject<ConversationEvent>(),
    outgoingMessageStream: new BehaviorSubject({ messages: loadedMessages, typingStatus: new Map() }),
    functions,
    model
  }

  conversation.outgoingMessageStream.subscribe({
    complete: () => {
      //console.log("completed conversation!")
    }
  })

  const aggregatedOutput = conversation.newMessagesInput.pipe(
    scanAsync<ConversationEvent, ScanState>(async (acc: ScanState, event: ConversationEvent) => {
      if (isNewMessageEvent(event) || isErrorMessageEvent(event)) {
        const result = await processMessagesWithHashing(model, event.payload, acc.lastResult);

        return {
          lastResult: result,
          event: { type: 'processedMessage', payload: result.message } as ProcessedMessageEvent,
        };
      }
      else {
        return { ...acc, event };
      }
    }, { lastResult: processedResults[processedResults.length - 1], event: null }),
    map((state) => state.event),
    filter<ConversationEvent | null, ConversationEvent>((event): event is ConversationEvent => event !== null),
    scan(
      (state: ConversationState, event: ConversationEvent) => {
        if (event.type === 'processedMessage') {
          const newMessages: ConversationMessages = [...state.messages, event.payload];
          const role = event.payload.role;
          if (isTyperRole(role) && state.typingStatus.get(role)) {
            return { ...state, messages: newMessages, typingStatus: new Map(state.typingStatus).set(role, '') };
          }

          if (role === 'function') {
            return { ...state, messages: newMessages, typingStatus: new Map(state.typingStatus).set("assistant", '') };
          }

          return { ...state, messages: newMessages };
        }
        else if (event.type === 'typingUpdate') {
          const newTypingStatus = new Map(state.typingStatus);
          newTypingStatus.set(event.payload.role, event.payload.content);
          return { ...state, typingStatus: newTypingStatus };
        }
        else {
          return state;
        }
      },
      conversation.outgoingMessageStream.value //shortcut for reusing the initial state of the output stream
    )
  )

  subscribeUntilFinalized(aggregatedOutput, conversation.outgoingMessageStream);

  return conversation;
}

export function sendSystemMessage(conversation: Conversation, message: string) {
  sendMessage(conversation, 'system', message);
}

export function teardownConversation(conversation: Conversation) {
  console.log("TEARDOWNCONVO");
  conversation.newMessagesInput.complete();
}

export function sendError(conversation: Conversation, error: unknown) {
  let errorMessage = 'An unexpected error occurred';

  if (error instanceof Error) {
    errorMessage = `Error(${error.name}): ${error.message}`.trim();
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (typeof error === 'number') {
    errorMessage = `Error code: ${error}`;
  } else if (typeof error === 'object' && error !== null) {
    errorMessage = JSON.stringify(error);
  }

  conversation.newMessagesInput.next({
    type: 'errorMessage',
    payload: {
      content: errorMessage,
      role: 'system'
    }
  });
}

export function sendFunctionCall(conversation: Conversation, content: string): void {
  conversation.newMessagesInput.next({
    type: 'newMessage',
    payload: {
      content: content,
      role: "function"
    }
  } as NewMessageEvent);
}

export function getLastMessage(conversation: Conversation): MessageDB {
  const messages = conversation.outgoingMessageStream.value.messages;
  return messages[messages.length - 1];
}

export function getAllMessages(conversation: Conversation): ConversationMessages {
  return conversation.outgoingMessageStream.value.messages;
}

export function getTypingStatus(conversation: Conversation, role: TyperRole): string {
  return conversation.outgoingMessageStream.value.typingStatus.get(role) ?? "";
}

export function observeNewMessagesWithLatestTypingMap(conversation: Conversation, includeExisting = false): Observable<[MessageDB, Map<TyperRole, string>]> {
  const indexToStartAt = includeExisting ? 0 : getAllMessages(conversation).length;

  return conversation.outgoingMessageStream.pipe(
    map(({messages, typingStatus}) => [messages, typingStatus] as [MessageDB[], Map<TyperRole, string>]),
    distinctUntilChanged(([messagesA, _typingStatusA], [messagesB, _typingStatusB]) => messagesA === messagesB),
    scan<[MessageDB[], Map<TyperRole, string>], [MessageDB[], number, Map<TyperRole, string>]>(([_lastMessages, index, _lastTypingStatus], [messages, typingStatus]) => {
      const newMessages = messages.slice(index);
      return [newMessages, index + newMessages.length, typingStatus];
    }, [[], indexToStartAt, new Map<TyperRole, string>()] as [MessageDB[], number, Map<TyperRole, string>]),
    concatMap(([messages, _index, typingStatus]) => {
      const messageUpdates = messages.map(message => { return [message, typingStatus] as [MessageDB, Map<TyperRole, string>]})
      return from(messageUpdates);
    }),
  );
}

export function observeNewMessages(conversation: Conversation, includeExisting = false): Observable<MessageDB> {
  return observeNewMessagesWithLatestTypingMap(conversation, includeExisting).pipe(
    map(([message, _typingStatus]) => message)
  );
}

export function observeTypingUpdates(conversation: Conversation, role: TyperRole): Observable<string> {
  return conversation.outgoingMessageStream.pipe(
    map(state => state.typingStatus.get(role) || ''),
    distinctUntilChanged()
  );
}
