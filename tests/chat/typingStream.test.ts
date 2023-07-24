import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { Participant, createParticipant } from '../../src/chat/participantSubjects';
import { setupTypingStream, teardownTypingStream } from '../../src/chat/typingStream';

describe('typingStream', () => {
  let participants: Participant[];
  let typingStream$: BehaviorSubject<Map<string, string>>;

  beforeEach(() => {
    // Create two participants
    const participant1 = createParticipant('user');
    const participant2 = createParticipant('ai');

    participants = [participant1, participant2];
    typingStream$ = new BehaviorSubject<Map<string, string>>(new Map());
  });

  it('initializes the typing stream to merge typing events from all participants', () => {
    const subscriptions = setupTypingStream(participants, typingStream$);

    // Participants start typing
    participants[0].typingStream.next('Hello');
    participants[1].typingStream.next('Hi');

    // The typing stream should contain typing events from both participants
    typingStream$.subscribe((typing: Map<string, string>) => {
      expect(typing.get('p1')).toEqual('Hello');
      expect(typing.get('p2')).toEqual('Hi');
    });

    subscriptions.forEach(subscription => subscription.unsubscribe());
  });

  it('tears down the typing stream subscriptions', () => {
    const subscriptions = setupTypingStream(participants, typingStream$);

    subscriptions.forEach(subscription => expect(subscription.closed).toBe(false));

    teardownTypingStream(subscriptions);

    subscriptions.forEach(subscription => expect(subscription.closed).toBe(true));
  });
});
