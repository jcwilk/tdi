import { BehaviorSubject, ReplaySubject, Subject, scan } from 'rxjs';
import { Participant, createParticipant, sendMessage, teardownParticipant, typeMessage } from './participantSubjects';
import { v4 as uuidv4 } from 'uuid';
import { MessageDB } from './conversationDb';
import { processMessagesWithHashing } from './messagePersistence';
import { FunctionCall, FunctionOption } from '../openai_api';
import { subscribeUntilFinalized } from './rxjsUtilities';
import { Message } from '@mui/icons-material';
import { generateCodeForFunctionCall } from './functionCalling';

export type Message = {
  content: string;
  participantId: string;
  role: string;
};

export type TypingUpdate = {
  participantId: string;
  content: string;
}

export type Conversation = {
  participants: Participant[];
  newMessagesInput: Subject<Message>;
  outgoingMessageStream: ReplaySubject<MessageDB>;
  typingStreamInput: Subject<TypingUpdate>;
  typingAggregationOutput: BehaviorSubject<Map<string, string>>;
  systemParticipant: Participant;
  functions: FunctionOption[];
  id: string;
};

export function createConversation(loadedMessages: MessageDB[]): Conversation {
  const systemParticipant = createParticipant("system");

  const conversation: Conversation = {
    participants: [],
    newMessagesInput: new Subject<Message>(),
    outgoingMessageStream: new ReplaySubject<MessageDB>(10000),
    typingStreamInput: new Subject<TypingUpdate>(),
    typingAggregationOutput: new BehaviorSubject(new Map()),
    systemParticipant,
    id: uuidv4(),
    functions: []
  }

  loadedMessages.forEach((message) => conversation.outgoingMessageStream.next(message));

  subscribeUntilFinalized(systemParticipant.sendingStream, conversation.newMessagesInput);

  const lastMessage = loadedMessages[loadedMessages.length - 1];
  const lastLoadedMessageHashes = lastMessage?.hash ? [lastMessage.hash] : [];

  // TODO: break this out of conversation, or at least out of its initialization - it's an undesirable coupling
  const persistedMessages = processMessagesWithHashing(conversation.newMessagesInput, lastLoadedMessageHashes);

  subscribeUntilFinalized(persistedMessages, conversation.outgoingMessageStream);

  subscribeUntilFinalized(conversation.typingStreamInput.pipe(
    scan((typingMap: Map<string, string>, typingUpdate: TypingUpdate) => {
      const newTypingValues = new Map(typingMap);
      newTypingValues.set(typingUpdate.participantId, typingUpdate.content);
      return newTypingValues;
    }, new Map())
  ), conversation.typingAggregationOutput);

  return conversation;
}

export function addParticipant(
  conversation: Conversation,
  participant: Participant
): Conversation {
  subscribeUntilFinalized(conversation.outgoingMessageStream, participant.incomingMessageStream);

  // We don't necessarily want to complete the conversation just because the subscriber completed
  participant.sendingStream.subscribe(conversation.newMessagesInput);
  participant.typingStream.subscribe(conversation.typingStreamInput);

  const newParticipants = [...conversation.participants, participant];

  return {
    ...conversation,
    participants: newParticipants
  }
}

export function removeParticipant(conversation: Conversation, id: string): Conversation {
  const participant = getParticipant(conversation, id);
  if (!participant) return conversation;

  teardownParticipant(participant)
  const newParticipants = conversation.participants.filter(participant => participant.id !== id);

  return {
    ...conversation,
    participants: newParticipants
  };
}

export function getParticipant(conversation: Conversation, id: string): Participant | undefined {
  return conversation.participants.find(participant => participant.id === id);
}

export function sendSystemMessage(conversation: Conversation, message: string) {
  const systemParticipant = conversation.systemParticipant;

  typeMessage(systemParticipant, message);
  sendMessage(systemParticipant);
}

export function teardownConversation(conversation: Conversation) {
  console.log("TEARDOWN")
  conversation.participants.forEach((participant) => teardownParticipant(participant));
  teardownParticipant(conversation.systemParticipant);

  conversation.newMessagesInput.complete();
  conversation.typingStreamInput.complete();
}

export function sendError(conversation: Conversation, error: Error) {
  conversation.outgoingMessageStream.error(error);
}

export function sendFunctionCall(conversation: Conversation, functionCall: FunctionCall, result: any): void {
  // TODO: this is overstepping an abstraction or two, but it's something we can come back to
  // as the function calling stuff firms up
  conversation.newMessagesInput.next({
    // TODO: name: generateCodeForFunctionCall(functionCall),
    content: `returned value: ${JSON.stringify(result)}`,
    participantId: conversation.systemParticipant.id,
    role: "function"
  });
}
