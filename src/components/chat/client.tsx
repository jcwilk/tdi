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

// This is the main component for the chat client
// A problem it suffers from is that the navigation is poorly coupled to the conversation manager hook
// To amerliorate this, we'll make sure that each item of state has exactly one source of truth
// and then carefully establish the dependencies between those sources of truths.

// Naviagtion state:
// - stateConversation: uuid | null - the uuid of the active conversation, or null if there is no active conversation
// - paramLeafHash: sha | null - the leaf hash of the conversation at the time of navigation, or null if it's trying to load the index
// a couple caveats here are that:
// - stateConversation may refer to a conversation that is no longer in the runningConversations list
// - paramLeafHash may refer to an earlier state of the conversation at stateConversation
//   - stateConversation should take precedence, and it should replace the navstate with the current leaf hash

// Conversation manager state:
// - runningConversations: Map<uuid, Conversation> - the list of conversations that are currently running, this always starts empty on page load
// - activeConversation: Conversation | null - the conversation that is currently active, or null if there is no active conversation
//   - this is derived from stateConversation and runningConversations
//

const Client: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  const stateConversation: string | null = location.state?.activeConversation ?? null;

  const paramLeafHash = params.get('ln');

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
  } = useConversationsManager(stateConversation, handleNewConversation);

  useEffect(() => {
    let isMounted = true

    if (paramLeafHash) {
      console.log("REDIRECTING")
      navigate('?', { replace: true });

      db.getMessageByHash(paramLeafHash).then(message => {
        if (!message || !isMounted) {
          console.log("message retrieval aborted!", message, isMounted)
          return
        }
        console.log("found message!", message)

        initiateConversation(message);
      });
    }

    return () => { isMounted = false }
  }, [])

  const getCurrentNavState = useCallback((): NavigateState => {
    return { activeConversation: activeConversation?.id ?? null };
  }, [activeConversation]);

  console.log("paramLeafHash", paramLeafHash)
  console.log("stateConversation", stateConversation)
  console.log("activeConversation", activeConversation)
  console.log("runningConversations", runningConversations)

  const handleLeafMessageClose = useCallback(() => {
    navigate(-1); // Will revert to the previous URL
  }, [navigate]);

  const handleNewHash = useCallback((hash: string) => {
    navigate(`?ln=${hash}`, {replace: true, state: getCurrentNavState()})
  }, [navigate, getCurrentNavState]);

  const handleLeafMessageSelect = useCallback(async (leafMessage: MessageDB, uuid: string = "") => {
    const initialLeafHash = leafMessage.hash;

    console.log("STARTING CONVO", emojiSha(initialLeafHash, 5), initialLeafHash, "|"+uuid+"|");

    await initiateConversation(leafMessage, uuid);
  }, [initiateConversation]);

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
      onNewHash={handleNewHash}
      onClose={handleLeafMessageClose}
      onOpenNewConversation={handleLeafMessageSelect}
      onNewModel={model => handleModelChange(activeConversation, model)}
      onFunctionsChange={handleFunctionsChange}
    />
  );
};

export default Client;
