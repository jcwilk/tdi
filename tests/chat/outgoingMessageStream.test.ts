import { ReplaySubject } from 'rxjs';
import { Message, Participant, createParticipant } from '../../src/chat/participantSubjects';
import { setupOutgoingMessageStream, teardownOutgoingMessageStream } from '../../src/chat/outgoingMessageStream';

describe('outgoingMessageStream', () => {
  let participants: Participant[];
  let oldOutgoingMessageStream$: ReplaySubject<Message>;

  beforeEach(() => {
    // Create two participants with messages
    const participant1 = createParticipant('user');
    const participant2 = createParticipant('ai');

    participants = [participant1, participant2];
    oldOutgoingMessageStream$ = new ReplaySubject<Message>(1);
  });

  it('initializes the outgoing message stream to merge messages from all participants', (done) => {
    const { outgoingMessageStream$, subscription } = setupOutgoingMessageStream(participants, oldOutgoingMessageStream$);

    const receivedMessages: Message[] = [];
    const expectedMessages: Message[] = [
      { id: 'm1', content: 'Hello', participantId: 'p1', role: 'user' },
      { id: 'm2', content: 'Hi', participantId: 'p2', role: 'ai' }
    ];

    // The outgoing message stream should contain messages from both participants
    outgoingMessageStream$.subscribe((message: Message) => {
      receivedMessages.push(message);
      if (receivedMessages.length === expectedMessages.length) {
        expect(receivedMessages).toEqual(expectedMessages);
        done();
      }
    });

    // Participants send messages
    participants[0].sendingStream.next(expectedMessages[0]);
    participants[1].sendingStream.next(expectedMessages[1]);

    teardownOutgoingMessageStream(subscription);
  });


  it('tears down the outgoing message stream subscription', () => {
    const { subscription } = setupOutgoingMessageStream(participants, oldOutgoingMessageStream$);
    expect(subscription.closed).toBe(false);

    teardownOutgoingMessageStream(subscription);

    expect(subscription.closed).toBe(true);
  });
});
