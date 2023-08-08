import { BehaviorSubject, Subject, ReplaySubject, takeUntil, Observable } from 'rxjs';
import { Message, TypingUpdate } from './conversation';
import { v4 as uuidv4 } from 'uuid';

export type Participant = {
  id: string;
  role: string;
  typingStreamInput: Subject<string>;
  typingStream: BehaviorSubject<TypingUpdate>;
  sendingStream: Subject<Message>;
  incomingMessageStream: ReplaySubject<Message>;
  stopListening: Subject<void>;
};

export function createParticipant(role: string): Participant {
  const id = uuidv4();
  const participant: Participant = {
    id,
    role,
    typingStreamInput: new Subject<string>(),
    typingStream: new BehaviorSubject({ participantId: id, content: '' }),
    sendingStream: new Subject(),
    incomingMessageStream: new ReplaySubject(10000),
    stopListening: new Subject()
  };

  participant.typingStreamInput.subscribe({
    next: (content) => {
      participant.typingStream.next({ participantId: id, content });
    }
  });

  return participant;
}

export function typeMessage(participant: Participant, content: string): void {
  participant.typingStreamInput.next(content);
}

export function sendMessage(participant: Participant): void {
  const { content } = participant.typingStream.value;

  if(!content) return;

  participant.sendingStream.next({
    content,
    participantId: participant.id,
    role: participant.role
  });
  participant.typingStreamInput.next('');
}

export function subscribeWhileAlive(
  participant: Participant,
  source: Observable<any>,
  subscriber: Subject<any>
): void {
  source.pipe(
    takeUntil(participant.stopListening)
  ).subscribe(subscriber);
}
