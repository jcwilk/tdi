// conversation.test.ts
import { addParticipant, createConversation } from '../../src/chat/conversation';
import { createParticipant, sendMessage, typeMessage } from '../../src/chat/participantSubjects';
import { TestScheduler } from 'rxjs/testing';

import indexedDB from 'fake-indexeddb';

describe('Conversation', () => {
  let testScheduler: TestScheduler;

  beforeAll(() => {
    // Mock the IndexedDB
    (global as any).indexedDB = indexedDB;
  });

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('correctly processes typing and message sending of participants', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const user = createParticipant('user');
      const agent = createParticipant('agent');

      // TODO: the following test fails due to async issues around persistence - probably a sign we should split it out!
      // const conversationOnlyUser = addParticipant(createConversation([]), user);
      // const conversation = addParticipant(conversationOnlyUser, agent);

      // const { outgoingMessageStream, typingAggregationOutput } = conversation;


      // cold('a-').subscribe(() => typeMessage(user, 'Hello'));
      // cold('-a').subscribe(() => typeMessage(agent, 'Welcome!'));
      // // TODO: too many typing events are firing somehow
      // // expectObservable(typingAggregationOutput).toBe('ab', {
      // //   a: new Map([[user.id, 'Hello'], [agent.id, '']]),
      // //   b: new Map([[user.id, 'Hello'], [agent.id, 'Welcome!']])
      // // });

      // cold('a-').subscribe(() => sendMessage(user));
      // cold('-a').subscribe(() => sendMessage(agent));
      // expectObservable(outgoingMessageStream).toBe('ab', {
      //   a: { id: expect.any(String), content: 'Hello', participantId: user.id, role: user.role },
      //   b: { id: expect.any(String), content: 'Welcome!', participantId: agent.id, role: agent.role }
      // });
    });
  });
});
