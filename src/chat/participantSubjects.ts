import { BehaviorSubject, Subject, ReplaySubject, takeUntil, Observable, map, finalize } from 'rxjs';
import { Message, TypingUpdate } from './conversation';
import { v4 as uuidv4 } from 'uuid';
import { FunctionCall } from '../openai_api';

export type Participant = {
  id: string;
  role: string;
  typingStreamInput: Subject<string>;
  typingStream: BehaviorSubject<TypingUpdate>;
  sendingStream: Subject<Message>;
  incomingMessageStream: ReplaySubject<Message>;
};

export function createParticipant(role: string): Participant {
  const id = uuidv4();
  const participant: Participant = {
    id,
    role,
    typingStreamInput: new Subject<string>(),
    typingStream: new BehaviorSubject({ participantId: id, content: '' }),
    sendingStream: new Subject(),
    incomingMessageStream: new ReplaySubject(10000)
  };

  participant.typingStreamInput.pipe(
    map((content) => ({ participantId: id, content })),
    finalize(() => participant.typingStream.complete())
  ).subscribe(participant.typingStream);

  return participant;
}

export function typeMessage(participant: Participant, content: string): void {
  participant.typingStreamInput.next(content);
}

export function sendMessage(participant: Participant): void {
  const { content } = participant.typingStream.value;

  if(!content) return;

  participant.typingStreamInput.next('');
  participant.sendingStream.next({
    content,
    participantId: participant.id,
    role: participant.role
  });
}

export function teardownParticipant(participant: Participant): void {
  participant.typingStreamInput.complete();
  participant.incomingMessageStream.complete();
}
