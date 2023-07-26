// participantSubjects.test.ts
import { createParticipant, sendMessage, typeMessage } from '../../src/chat/participantSubjects';
import { TestScheduler } from 'rxjs/testing';

describe('Participant', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('creates a new participant', () => {
    const participant = createParticipant('AI');
    expect(participant.role).toBe('AI');
  });

  it('allows participant to type and send a message', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const participant = createParticipant('AI');

      cold('a-').subscribe(() => typeMessage(participant, 'Hello'));
      cold('-a').subscribe(() => sendMessage(participant));
      expectObservable(participant.sendingStream).toBe('-a', {
        a: {
          id: expect.any(String),
          content: 'Hello',
          participantId: participant.id,
          role: participant.role
        }
      });
    });
  });
});
