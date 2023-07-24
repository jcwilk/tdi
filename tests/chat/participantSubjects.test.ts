// participantSubjects.test.ts
import { createParticipant } from '../../src/chat/participantSubjects';
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

  it('allows participant to send a message', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const participant = createParticipant('AI');

      const message = {
        id: '1',
        content: 'Hello, world!',
        participantId: participant.id,
        role: participant.role
      };

      cold('-a').subscribe(() => participant.sendingStream.next(message));
      expectObservable(participant.sendingStream).toBe('-a', { a: message });
    });
  });

  it('allows participant to type a message', () => {
    testScheduler.run(({ cold, expectObservable }) => {
      const participant = createParticipant('AI');

      cold('-a').subscribe(() => participant.typingStream.next('Hello'));
      expectObservable(participant.typingStream).toBe('ab', { a: '', b: 'Hello' });
    });
  });
});
