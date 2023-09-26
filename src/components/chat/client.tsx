import React, { useMemo } from 'react';
import { ConversationDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages from './leafMessages';
import { useConversationsManager } from './useConversationManager';

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

const Client: React.FC = () => {
  const db = useMemo(() => new ConversationDB(), []);

  const {
    activeConversation,
    runningConversations,
    goBack,
    openConversation,
    changeModel,
    changeFunctions
  } = useConversationsManager(db);

  const runningConversationsArray = useMemo(() => Array.from(runningConversations.values()), [runningConversations]);

  if (!activeConversation) {
    return <LeafMessages db={db} runningConversations={runningConversationsArray} onSelect={openConversation} />;
  }

  return (
    <ConversationModal
      key={activeConversation.id}
      conversation={activeConversation}
      onClose={goBack}
      onOpenNewConversation={openConversation}
      onNewModel={changeModel}
      onFunctionsChange={changeFunctions}
    />
  );
};

export default Client;
