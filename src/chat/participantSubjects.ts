import { Conversation, Message, NewMessageEvent, TypingUpdate, TypingUpdateEvent } from './conversation';

export type TyperRole = 'user' | 'assistant'; // we don't currently have support for typing events for system/function
export type ParticipantRole = TyperRole | 'system' | 'function';

export function isTyperRole(role: ParticipantRole): role is TyperRole {
  return role === 'user' || role === 'assistant';
}

export function typeMessage(conversation: Conversation, role: TyperRole, content: string): void {
  conversation.newMessagesInput.next({
    type: 'typingUpdate',
    payload: {
      role,
      content
    } as TypingUpdate
  } as TypingUpdateEvent);
}

export function sendMessage(conversation: Conversation, role: ParticipantRole, content: string): void {
  if(!content) return;

  conversation.newMessagesInput.next({
    type: 'newMessage',
    payload: {
      content,
      role
    } as Message
  } as NewMessageEvent);
}
