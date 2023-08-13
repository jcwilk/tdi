import { BehaviorSubject, ReplaySubject, Subject, Subscription, of } from 'rxjs';
import { Participant, createParticipant, sendMessage, subscribeWhileAlive, typeMessage } from './participantSubjects';
import { v4 as uuidv4 } from 'uuid';
import { MessageDB } from './conversationDb';
import { processMessagesWithHashing } from './messagePersistence';

export type Message = {
  content: string;
  participantId: string;
  role: string;
};

export type TypingUpdate = {
  participantId: string;
  content: string;
}

export type Conversation = {
  participants: Participant[];
  newMessagesInput: Subject<Message>;
  outgoingMessageStream: ReplaySubject<MessageDB>;
  typingStreamInput: Subject<TypingUpdate>;
  typingAggregationOutput: BehaviorSubject<Map<string, string>>;
  outgoingMessageStreamSubscription?: Subscription;
  systemParticipant: Participant;
  teardown: () => void;
  id: string;
};

export function createConversation(loadedMessages: MessageDB[]): Conversation {
  const systemParticipant = createParticipant("system");

  const teardown = () => {
    conversation.participants.forEach((participant) => participant.stopListening.next());
    conversation.systemParticipant.stopListening.next();
  }

  const conversation: Conversation = {
    participants: [],
    newMessagesInput: new Subject<Message>(),
    outgoingMessageStream: new ReplaySubject<MessageDB>(10000),
    typingStreamInput: new Subject<TypingUpdate>(),
    typingAggregationOutput: new BehaviorSubject(new Map()),
    systemParticipant: systemParticipant,
    teardown,
    id: uuidv4()
  }

  loadedMessages.forEach((message) => conversation.outgoingMessageStream.next(message));

  subscribeWhileAlive(systemParticipant, systemParticipant.sendingStream, conversation.newMessagesInput);
  // TODO: next its stopListening stream when destroying this conversation. at time of writing conversation destruction hadn't yet been implemented.

  const lastMessage = loadedMessages[loadedMessages.length - 1];
  const lastLoadedMessageHashes = lastMessage?.hash ? [lastMessage.hash] : [];

  // TODO: break this out of conversation, or at least out of its initialization - it's an undesirable coupling
  const persistedMessages = processMessagesWithHashing(conversation.newMessagesInput, lastLoadedMessageHashes);

  const tmpSubject = new Subject<MessageDB>();
  persistedMessages.subscribe({
    next: (value) => tmpSubject.next(value),
    error: (err) => console.error("error persisting message", err)
  });

  tmpSubject.subscribe(conversation.outgoingMessageStream);

  //subscribeWhileAlive(systemParticipant, tmpSubject, conversation.outgoingMessageStream);

  conversation.typingStreamInput.subscribe({
    next: ({participantId, content}) => {
      const newTypingValues = new Map(conversation.typingAggregationOutput.value);
      newTypingValues.set(participantId, content);
      conversation.typingAggregationOutput.next(newTypingValues);
    },
  });

  return conversation;
}

export function addParticipant(
  conversation: Conversation,
  participant: Participant
): Conversation {
  subscribeWhileAlive(participant, conversation.outgoingMessageStream, participant.incomingMessageStream);
  subscribeWhileAlive(participant, participant.sendingStream, conversation.newMessagesInput);
  subscribeWhileAlive(participant, participant.typingStream, conversation.typingStreamInput);

  const newParticipants = [...conversation.participants, participant];

  return {
    ...conversation,
    participants: newParticipants
  }
}

export function removeParticipant(conversation: Conversation, id: string): Conversation {
  const participant = getParticipant(conversation, id);
  participant?.stopListening.next();

  const newParticipants = conversation.participants.filter(participant => participant.id !== id);

  return {
    ...conversation,
    participants: newParticipants
  };
}

export function getParticipant(conversation: Conversation, id: string): Participant | undefined {
  return conversation.participants.find(participant => participant.id === id);
}

export function sendSystemMessage(conversation: Conversation, message: string) {
  const systemParticipant = conversation.systemParticipant;

  typeMessage(systemParticipant, message);
  sendMessage(systemParticipant);
}
