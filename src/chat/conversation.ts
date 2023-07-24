import { BehaviorSubject, ReplaySubject, Subscription, merge } from 'rxjs';
import { Message, Participant, configureParticipantStreams } from './participantSubjects';
import { setupOutgoingMessageStream, teardownOutgoingMessageStream } from './outgoingMessageStream';
import { setupTypingStream, teardownTypingStream } from './typingStream';

export type Conversation = {
  participants: Participant[];
  outgoingMessageStream$: ReplaySubject<Message>;
  typingStream$: BehaviorSubject<Map<string, string>>;
  outgoingMessageStreamSubscription?: Subscription;
  typingStreamSubscriptions: Subscription[];
};

export function createConversation(): Conversation {
  return {
    participants: [],
    outgoingMessageStream$: new ReplaySubject(1),
    typingStream$: new BehaviorSubject(new Map()),
    typingStreamSubscriptions: []
  };
}

export function addParticipant(
  conversation: Conversation,
  participant: Participant
): Conversation {
  configureParticipantStreams(participant, conversation);

  const newParticipants = [...conversation.participants, participant];

  conversation.outgoingMessageStreamSubscription?.unsubscribe();
  const subscription = merge(
    ...newParticipants.map(participant => participant.sendingStream)
  ).subscribe(message => conversation.outgoingMessageStream$.next(message));

  teardownTypingStream(conversation.typingStreamSubscriptions);
  const typingStreamSubscriptions = setupTypingStream(newParticipants, conversation.typingStream$);

  return {
    ...conversation,
    participants: newParticipants,
    outgoingMessageStreamSubscription: subscription,
    typingStreamSubscriptions
  }
}

export function removeParticipant(conversation: Conversation, id: string): Conversation {
  const participant = getParticipant(conversation, id);
  participant?.stopListening$.next();

  const newParticipants = conversation.participants.filter(participant => participant.id !== id);

  if (conversation.outgoingMessageStreamSubscription) {
    teardownOutgoingMessageStream(conversation.outgoingMessageStreamSubscription);
  }
  teardownTypingStream(conversation.typingStreamSubscriptions);

  const { outgoingMessageStream$, subscription } = setupOutgoingMessageStream(newParticipants, conversation.outgoingMessageStream$);
  const typingStreamSubscriptions = setupTypingStream(newParticipants, conversation.typingStream$);

  return {
    ...conversation,
    participants: newParticipants,
    outgoingMessageStreamSubscription: subscription,
    outgoingMessageStream$,
    typingStreamSubscriptions
  };
}

export function getParticipant(conversation: Conversation, id: string): Participant | undefined {
  return conversation.participants.find(participant => participant.id === id);
}
