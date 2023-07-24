import { BehaviorSubject, Subject, ReplaySubject, takeUntil, Observable } from 'rxjs';
import { Message, TypingUpdate } from './conversation';

export type Participant = {
  id: string;
  role: string;
  typingStreamInput$: Subject<string>;
  typingStream: BehaviorSubject<TypingUpdate>;
  sendingStream: Subject<Message>;
  incomingMessageStream: ReplaySubject<Message>;
  stopListening$: Subject<void>;
};

let currentId = 0;

export function createParticipant(role: string): Participant {
  const id = `p${currentId++}`;
  const participant: Participant = {
    id,
    role,
    typingStreamInput$: new Subject<string>(),
    typingStream: new BehaviorSubject({ participantId: id, content: '' }),
    sendingStream: new Subject(),
    incomingMessageStream: new ReplaySubject(10000),
    stopListening$: new Subject()
  };

  participant.typingStreamInput$.subscribe({
    next: (content) => {
      participant.typingStream.next({ participantId: id, content });
    }
  });

  return participant;
}

export function subscribeWhileAlive(
  participant: Participant,
  source: Observable<any>,
  subscriber: Subject<any>
): void {
  source.pipe(
    takeUntil(participant.stopListening$)
  ).subscribe(subscriber);
}
