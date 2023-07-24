import { BehaviorSubject, ReplaySubject, Subject, Subscription } from 'rxjs';
import { Participant, subscribeWhileAlive } from './participantSubjects';

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
  outgoingMessageStream$: ReplaySubject<Message>;
  typingStreamInput$: Subject<TypingUpdate>;
  typingAggregationOutput$: BehaviorSubject<Map<string, string>>;
  outgoingMessageStreamSubscription?: Subscription;
};

export function createConversation(): Conversation {
  const conversation: Conversation = {
    participants: [],
    outgoingMessageStream$: new ReplaySubject(10000),
    typingStreamInput$: new Subject<TypingUpdate>(),
    typingAggregationOutput$: new BehaviorSubject(new Map())
  }

  conversation.typingStreamInput$.subscribe({
    next: ({participantId, content}) => {
      const newTypingValues = new Map(conversation.typingAggregationOutput$.value);
      newTypingValues.set(participantId, content);
      conversation.typingAggregationOutput$.next(newTypingValues);
    },
  });

  return conversation;
}

export function addParticipant(
  conversation: Conversation,
  participant: Participant
): Conversation {
  subscribeWhileAlive(participant, conversation.outgoingMessageStream$, participant.incomingMessageStream);
  subscribeWhileAlive(participant, participant.sendingStream, conversation.outgoingMessageStream$);
  subscribeWhileAlive(participant, participant.typingStream, conversation.typingStreamInput$);

  const newParticipants = [...conversation.participants, participant];

  return {
    ...conversation,
    participants: newParticipants
  }
}

export function removeParticipant(conversation: Conversation, id: string): Conversation {
  const participant = getParticipant(conversation, id);
  participant?.stopListening$.next();

  const newParticipants = conversation.participants.filter(participant => participant.id !== id);

  return {
    ...conversation,
    participants: newParticipants
  };
}

export function getParticipant(conversation: Conversation, id: string): Participant | undefined {
  return conversation.participants.find(participant => participant.id === id);
}
