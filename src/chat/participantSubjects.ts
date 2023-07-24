import { BehaviorSubject, Subject, ReplaySubject, takeUntil } from 'rxjs';
import { Conversation } from './conversation';

export type Message = {
  id: string;
  content: string;
  participantId: string;
  role: string; // 'user' or any other string implies a named ai agent
};

export type Participant = {
  id: string;
  role: string;
  typingStream: BehaviorSubject<string>;
  sendingStream: Subject<Message>;
  incomingMessageStream: ReplaySubject<Message>;
  stopListening$: Subject<void>;
};

let currentId = 0;

export function createParticipant(role: string): Participant {
  const id = `p${currentId++}`;
  return {
    id,
    role,
    typingStream: new BehaviorSubject(''),
    sendingStream: new Subject(),
    incomingMessageStream: new ReplaySubject(1),
    stopListening$: new Subject()
  };
}

export function configureParticipantStreams(
  participant: Participant,
  conversation: Conversation
): void {
  conversation.outgoingMessageStream$.pipe(
    takeUntil(participant.stopListening$)
  ).subscribe(participant.incomingMessageStream);
}
