// conversation.test.ts
import { addParticipant, createConversation } from '../../src/chat/conversation';
import { Message, createParticipant } from '../../src/chat/participantSubjects';
import { TestScheduler } from 'rxjs/testing';

describe('Conversation', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('creates a conversation with the correct initial state', () => {
    const { participants, outgoingMessageStream$, typingStream$ } = createConversation();
    expect(participants).toEqual([]);
    expect(outgoingMessageStream$).toBeDefined();
    expect(typingStream$).toBeDefined();
  });

  it('correctly processes typing and message sending of participants', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const participant = createParticipant('user');
      const conversation = addParticipant(createConversation(), participant);
      const { outgoingMessageStream$, typingStream$ } = conversation;

      cold('-a').subscribe(() => participant.typingStream.next('Hello'));
      expectObservable(typingStream$).toBe('ab', {
        a: new Map([[participant.id, '']]),
        b: new Map([[participant.id, 'Hello']])
      });

      const message: Message = { id: 'm1', content: 'Hello', participantId: 'p1', role: 'user' };
      cold('-a').subscribe(() => participant.sendingStream.next(message));
      expectObservable(outgoingMessageStream$).toBe('-a', { a: message });
    });
  });
});
