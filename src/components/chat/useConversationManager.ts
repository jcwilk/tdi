import { useEffect, useCallback, useReducer, useMemo } from 'react';
import { tap } from 'rxjs';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Conversation, addParticipant, createConversation, teardownConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import { createParticipant } from '../../chat/participantSubjects';

const db = new ConversationDB();

function buildParticipatedConversation(messages: MessageDB[], model: string = "gpt-3.5-turbo") {
  return addAssistant(addParticipant(createConversation(messages), createParticipant('user')), model);
}

type Action =
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'UPDATE_CONVERSATION'; payload: Conversation }
  | { type: 'SET_CONVERSATIONS'; payload: Map<string, Conversation> }
  ;

function conversationReducer(state: Map<string, Conversation>, action: Action): Map<string, Conversation> {
  switch (action.type) {
    case 'ADD_CONVERSATION':
      if (state.has(action.payload.id)) throw new Error(`Conversation with id ${action.payload.id} already exists!`);

      return new Map(state).set(action.payload.id, action.payload);
    case 'UPDATE_CONVERSATION':
      if (!state.has(action.payload.id)) throw new Error(`Conversation with id ${action.payload.id} does not exist!`);

      return new Map(state).set(action.payload.id, action.payload);
    default:
      throw new Error(`Unknown action: ${JSON.stringify(action)}`);
  }
}

export function useConversationsManager(navStateUUID: string | null, handleNewConversation: (newLeafHash: string, uuid: string) => void) {
  const [runningConversations, dispatch] = useReducer(conversationReducer, new Map<string, Conversation>());

  const activeConversation = useMemo(() => navStateUUID ? runningConversations.get(navStateUUID) ?? null : null, [navStateUUID, runningConversations]);

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
      dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
      uuid = conversation.id;
    }

    handleNewConversation(leafMessage.hash, uuid);
  }, [handleNewConversation]);

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
    const newConversationIdCorrected = { ...newConversation, id: conversation.id };
    dispatch({ type: 'UPDATE_CONVERSATION', payload: newConversationIdCorrected });
    teardownConversation(conversation);
  }, []);

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

    // TODO: this is a hack to be able to replace the conversation, rather than add a new one
    const newConversationIdCorrected = { ...newConversation, id: conversation.id };
    dispatch({ type: 'UPDATE_CONVERSATION', payload: newConversationIdCorrected });
    teardownConversation(conversation);
  }, []);

  return {
    runningConversations,
    activeConversation,
    initiateConversation,
    handleModelChange,
    handleFunctionsChange
  };
}
