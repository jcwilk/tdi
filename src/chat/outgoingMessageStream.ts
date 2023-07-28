import { merge, ReplaySubject, Subscription } from 'rxjs';
import { Participant, Message } from './participantSubjects';

const CHAT_HISTORY_LENGTH = 100;

export function setupOutgoingMessageStream(participants: Participant[], existingMessageStream: ReplaySubject<Message>): { outgoingMessageStream: ReplaySubject<Message>, subscription: Subscription } {
  const outgoingMessageStream = new ReplaySubject<Message>(CHAT_HISTORY_LENGTH);

  // Temporary subscription to copy values from existing message stream to new stream
  const tempSubscription = existingMessageStream.subscribe(outgoingMessageStream);
  tempSubscription.unsubscribe();

  const mergedStream = merge(
    ...participants.map(participant => participant.sendingStream)
  );

  const subscription = mergedStream.subscribe(message => outgoingMessageStream.next(message));

  return { outgoingMessageStream, subscription };
}


export function teardownOutgoingMessageStream(subscription: Subscription): void {
  subscription.unsubscribe();
}
