import React, { useCallback, useEffect } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages, { RunningConversationOption } from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';
import { emojiSha } from '../../chat/emojiSha';
import { useConversationsManager } from './useConversationManager';
import { pluckLast } from '../../chat/rxjsUtilities';

const db = new ConversationDB();

type NavigateState = {
  activeConversation: string | null; // uuid
};

const Client: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const stateConversation: string | null = location.state?.activeConversation ?? null;

  const paramLeafHash = params.get('ln');
  // TODO: handle initial load of conversation and swap in the base path so we can still use the back button

  useEffect(() => {
    if (paramLeafHash) {
      console.log("REDIRECTING")
      navigate('?', { replace: true });

      // TODO: adding this back in causes bad behavior when navigating back and forth
      // there appears to be a race condition of sorts between the conversationmanager and navigation
      // the fact that all the db stuff is async doesn't help, but ultimately we need to just make the
      // navigation stuff more bulletproof, and the conversationmanager less coupled to the navigation
      //navigate(`?ln=${paramLeafHash}`)
    }
  }, [])

  const handleNewConversation = useCallback((newLeafHash: string, uuid: string) => {
    const navigateState: NavigateState = {
      activeConversation: uuid
    };

    navigate(`?ln=${newLeafHash}`, { state: navigateState });
    console.log("NAVIGATING", uuid, newLeafHash)
  }, [navigate]);

  const {
    runningConversations,
    activeConversation,
    initiateConversation,
    handleModelChange,
    handleFunctionsChange,
  } = useConversationsManager(stateConversation, paramLeafHash, handleNewConversation);

  function getCurrentNavState(): NavigateState {
    return { activeConversation: activeConversation?.id ?? null };
  }

  console.log("stateConversation", stateConversation)
  console.log("activeConversation", activeConversation)
  console.log("runningConversations", runningConversations)

  const handleLeafMessageClose = useCallback(() => {
    navigate(-1); // Will revert to the previous URL
  }, [navigate]);

  const handleLeafMessageSelect = useCallback(async (leafMessage: MessageDB, uuid: string = "") => {
    const initialLeafHash = leafMessage.hash;

    console.log("STARTING CONVO", emojiSha(initialLeafHash, 5), initialLeafHash, "|"+uuid+"|");

    uuid = await initiateConversation(leafMessage, uuid);

    const navigateState: NavigateState = {
      activeConversation: uuid
    };
    console.log("navigateState", navigateState);

    navigate(`?ln=${initialLeafHash}`, { state: navigateState });
  }, [navigate, initiateConversation]);

  if (!activeConversation) {
    const runningLeafMessages: RunningConversationOption[] = [];
    for (const [uuid, conversation] of runningConversations) {
      const lastOne = pluckLast(conversation.outgoingMessageStream);

      if(lastOne) runningLeafMessages.push({uuid, message: lastOne});
    };
    return <LeafMessages db={db} runningLeafMessages={runningLeafMessages} onSelect={handleLeafMessageSelect} />;
  }

  return (
    <ConversationModal
      key={activeConversation.id}
      conversation={activeConversation}
      initialGptModel={"gpt-3.5-turbo"}
      onNewHash={(hash) => { navigate(`?ln=${hash}`, {replace: true, state: getCurrentNavState()}) }}
      onClose={handleLeafMessageClose}
      onOpenNewConversation={handleLeafMessageSelect}
      onNewModel={model => handleModelChange(activeConversation, model)}
      onFunctionsChange={handleFunctionsChange}
    />
  );
};

export default Client;
