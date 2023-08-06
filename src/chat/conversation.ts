import { BehaviorSubject, ReplaySubject, Subject, Subscription } from 'rxjs';
import { Participant, createParticipant, sendMessage, subscribeWhileAlive, typeMessage } from './participantSubjects';
import { v4 as uuidv4 } from 'uuid';

export type Message = {
  id: string;
  content: string;
  participantId: string;
  role: string; // 'user' or any other string implies a named ai agent
};

export type TypingUpdate = {
  participantId: string;
  content: string;
}

export type Conversation = {
  participants: Participant[];
  outgoingMessageStream: ReplaySubject<Message>;
  typingStreamInput: Subject<TypingUpdate>;
  typingAggregationOutput: BehaviorSubject<Map<string, string>>;
  outgoingMessageStreamSubscription?: Subscription;
  systemParticipant: Participant;
  id: string;
};

export function createConversation(): Conversation {
  const systemParticipant = createParticipant("system");

  const conversation: Conversation = {
    participants: [],
    outgoingMessageStream: new ReplaySubject(10000),
    typingStreamInput: new Subject<TypingUpdate>(),
    typingAggregationOutput: new BehaviorSubject(new Map()),
    systemParticipant: systemParticipant,
    id: uuidv4()
  }

  subscribeWhileAlive(systemParticipant, systemParticipant.sendingStream, conversation.outgoingMessageStream);
  // TODO: next its stopListening stream when destroying this conversation. at time of writing conversation destruction hadn't yet been implemented.

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
  subscribeWhileAlive(participant, participant.sendingStream, conversation.outgoingMessageStream);
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
