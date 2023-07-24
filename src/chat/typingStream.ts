import { BehaviorSubject, Subscription } from 'rxjs';
import { Participant } from './participantSubjects';

export function setupTypingStream(participants: Participant[], typingStream$: BehaviorSubject<Map<string, string>>): Subscription[] {
  const subscriptions: Subscription[] = [];

  participants.forEach(participant => {
    const subscription = participant.typingStream.subscribe({
      next: (typingValue) => {
        const newTypingValues = new Map(typingStream$.value);
        newTypingValues.set(participant.id, typingValue);
        typingStream$.next(newTypingValues);
      },
    });
    subscriptions.push(subscription);
  });

  return subscriptions;
}

export function teardownTypingStream(subscriptions: Subscription[]): void {
  subscriptions.forEach(subscription => subscription.unsubscribe());
}
