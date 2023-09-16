import { BehaviorSubject, Observable, Subject, concat, concatMap, distinctUntilChanged, filter, from, map, of, scan } from 'rxjs';
import { ParticipantRole, TyperRole, isTyperRole, sendMessage } from './participantSubjects';
import { v4 as uuidv4 } from 'uuid';
import { MessageDB } from './conversationDb';
import { processMessagesWithHashing } from './messagePersistence';
import { FunctionCall, FunctionOption } from '../openai_api';
import { scanAsync, subscribeUntilFinalized } from './rxjsUtilities';

export type Message = {
  role: ParticipantRole;
  content: string;
};

export type TypingUpdate = {
  role: TyperRole;
  content: string;
}

export type NewMessageEvent = {
  type: 'newMessage';
  payload: Message;
};

export type ProcessedMessageEvent = {
  type: 'processedMessage';
  payload: MessageDB; // assuming MessageDB is the type for processed messages
};

export type TypingUpdateEvent = {
  type: 'typingUpdate';
  payload: TypingUpdate;
};

export type ConversationEvent = TypingUpdateEvent | NewMessageEvent | ProcessedMessageEvent;

function isNewMessageEvent(event: ConversationEvent): event is NewMessageEvent {
  return event.type === 'newMessage';
}

export type ConversationState = {
  messages: MessageDB[];
  typingStatus: Map<TyperRole, string>;
};

export type Conversation = {
  newMessagesInput: Subject<ConversationEvent>;
  outgoingMessageStream: BehaviorSubject<ConversationState>;
  functions: FunctionOption[];
  model: string;
  id: string;
};

interface ScanState {
  lastProcessedHash: string | null;
  event: TypingUpdateEvent | ProcessedMessageEvent | null;
}

export function createConversation(loadedMessages: MessageDB[], model: string = 'gpt-3.5-turbo', functions: FunctionOption[] = []): Conversation {
  const conversation: Conversation = {
    newMessagesInput: new Subject<ConversationEvent>(),
    outgoingMessageStream: new BehaviorSubject({ messages: loadedMessages, typingStatus: new Map() }),
    id: uuidv4(),
    functions,
    model
  }

  const lastMessage = loadedMessages[loadedMessages.length - 1];

  const aggregatedOutput = conversation.newMessagesInput.pipe(
    scanAsync<ConversationEvent, ScanState>(async (acc: ScanState, event: ConversationEvent) => {
      if (isNewMessageEvent(event)) {
        const currentParentHashes = acc.lastProcessedHash ? [acc.lastProcessedHash] : [];

        const persistedMessage = await processMessagesWithHashing(event.payload, currentParentHashes);

        return {
          lastProcessedHash: persistedMessage.hash,
          event: { type: 'processedMessage', payload: persistedMessage } as ProcessedMessageEvent,
        };
      }
      else {
        return { ...acc, event };
      }
    }, { lastProcessedHash: lastMessage?.hash ?? null, event: null }),
    map((state) => state.event),
    filter<ConversationEvent | null, ConversationEvent>((event): event is ConversationEvent => event !== null),
    scan(
      (state: ConversationState, event: ConversationEvent) => {
        if (event.type === 'processedMessage') {
          const newMessages = [...state.messages, event.payload];
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
  console.log("TEARDOWN");
  conversation.newMessagesInput.complete();
}

export function sendError(conversation: Conversation, error: Error) {
  conversation.outgoingMessageStream.error(error);
}

export function sendFunctionCall(conversation: Conversation, functionCall: FunctionCall, content: string): void {
  conversation.newMessagesInput.next({
    type: 'newMessage',
    payload: {
      content: content,
      role: "function"
    }
  } as NewMessageEvent);
}

export function getLastMessage(conversation: Conversation): MessageDB | undefined {
  const messages = conversation.outgoingMessageStream.value.messages;
  return messages[messages.length - 1];
}

export function getAllMessages(conversation: Conversation): MessageDB[] {
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
