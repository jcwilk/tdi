import { useState, useEffect, useCallback } from 'react';
import { ReplaySubject, tap } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, addParticipant, createConversation, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import { createParticipant } from '../../chat/participantSubjects';
import { pluckLast } from '../../chat/rxjsUtilities';

const db = new ConversationDB();

function buildParticipatedConversation(messages: MessageDB[], model: string = "gpt-3.5-turbo") {
  return addAssistant(addParticipant(createConversation(messages), createParticipant('user')), model);
}

export function useConversationsManager(stateConversation: string | null, initialLeafHash: string | null, handleNewConversation: (newLeafHash: string, uuid: string) => void) {
  const [runningConversations, setRunningConversations] = useState<Map<string, Conversation>>(new Map<string, Conversation>());

  // Deduce the active conversation directly inside the hook
  const activeConversation = stateConversation ? runningConversations.get(stateConversation) : null;

  const currentLeafHash = (() => {
    if (!activeConversation) return initialLeafHash;

    const lastMessage = pluckLast(activeConversation.outgoingMessageStream);
    if (lastMessage) return lastMessage.hash;

    return initialLeafHash;
  })();

  useEffect(() => {
    if (!activeConversation && initialLeafHash) {
      db.getMessageByHash(initialLeafHash).then(message => {
        if (message) {
          initiateConversation(message).then(uuid => handleNewConversation(initialLeafHash, uuid));
        }
      });
    }
  }, [initialLeafHash, activeConversation]);

  useEffect(() => {
    return () => {
      console.log("manager teardown!")
      runningConversations.forEach(conversation => teardownConversation(conversation))
    }
  }, []);

  const initiateConversation = useCallback(async (leafMessage: MessageDB, uuid: string = "") => {
    if (!runningConversations.has(uuid)) {
      const conversationFromDb = await db.getConversationFromLeaf(leafMessage.hash);
      const conversation = buildParticipatedConversation(conversationFromDb);
      setRunningConversations(prev => new Map(prev).set(conversation.id, conversation));
      return conversation.id;
    }

    return uuid;
  }, [runningConversations]);

  const handleModelChange = useCallback((conversation: Conversation, model: string) => {
    const messages: MessageDB[] = [];

    conversation
      .outgoingMessageStream
      .pipe(
        tap(message => messages.push(message))
      )
      .subscribe()
      .unsubscribe();

    const newConversation = buildParticipatedConversation(messages, model);
    newConversation.id = conversation.id;
    setRunningConversations(runningConversations => new Map(runningConversations).set(conversation.id, newConversation));
    teardownConversation(conversation);
  }, [])

  const handleFunctionsChange = useCallback((conversation: Conversation, updatedFunctions: any[]) => {
    const messages: MessageDB[] = [];

    conversation
      .outgoingMessageStream
      .pipe(
        tap(message => messages.push(message))
      )
      .subscribe()
      .unsubscribe();

    const conversationWithoutAssistant = addParticipant(createConversation(messages), createParticipant('user'));
    conversationWithoutAssistant.functions = updatedFunctions;
    const newConversation = addAssistant(conversationWithoutAssistant, 'gpt-3.5-turbo');
    newConversation.id = conversation.id;
    setRunningConversations(runningConversations => new Map(runningConversations).set(conversation.id, newConversation));
    teardownConversation(conversation);
  }, [])

  return {
    runningConversations,
    currentLeafHash,
    activeConversation,
    initiateConversation,
    handleModelChange,
    handleFunctionsChange
  };
}
