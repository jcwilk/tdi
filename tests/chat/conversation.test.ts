// conversation.test.ts
import { Message, addParticipant, createConversation } from '../../src/chat/conversation';
import { createParticipant } from '../../src/chat/participantSubjects';
import { TestScheduler } from 'rxjs/testing';

describe('Conversation', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('correctly processes typing and message sending of participants', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const user = createParticipant('user');
      const agent = createParticipant('agent');
      const conversationOnlyUser = addParticipant(createConversation(), user);
      const conversation = addParticipant(conversationOnlyUser, agent);

      const { outgoingMessageStream$, typingAggregationOutput$ } = conversation;

      cold('a-').subscribe(() => user.typingStreamInput$.next('Hello'));
      cold('-a').subscribe(() => agent.typingStreamInput$.next('Welcome!'));
      expectObservable(typingAggregationOutput$).toBe('ab', {
        a: new Map([[user.id, 'Hello'], [agent.id, '']]),
        b: new Map([[user.id, 'Hello'], [agent.id, 'Welcome!']])
      });

      const message1: Message = { id: 'm1', content: 'Test', participantId: user.id, role: user.role };
      const message2: Message = { id: 'm2', content: 'Test2', participantId: agent.id, role: agent.role };
      cold('a-').subscribe(() => user.sendingStream.next(message1));
      cold('-a').subscribe(() => agent.sendingStream.next(message2));
      expectObservable(outgoingMessageStream$).toBe('ab', { a: message1, b: message2 });
    });
  });
});
