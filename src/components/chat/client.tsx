import React, { useEffect, useMemo, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages, { RunningConversationOption } from './leafMessages';
import { useConversationsManager } from './useConversationManager';
import { getLastMessage, observeNewMessages } from '../../chat/conversation';

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

  const [version, setVersion] = useState(0);
  const [leafMessages, setLeafMessages] = useState<MessageDB[]>([]);

  useEffect(() => {
    const subscriptions = Array.from(runningConversations.values()).map(conversation =>
      observeNewMessages(conversation).subscribe(() => {
        // TODO: This causes everything to get repainted on every new message, but it should only cause the leafMessages interface to get repainted
        // instead, we should find a way to shunt all this subscription stuff into the leafMessages component, perhaps by passing runningConversations in?
        setVersion(prevVersion => prevVersion + 1);
      })
    );

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, [runningConversations]);

  // Using useMemo to only recompute runningLeafMessages when necessary
  const runningLeafMessages = useMemo(() => {
    const messages: RunningConversationOption[] = [];
    for (const [uuid, conversation] of runningConversations) {
      const lastOne = getLastMessage(conversation);

      if(lastOne) messages.push({uuid, message: lastOne});
    };
    return messages;
  }, [runningConversations, version]);

  useEffect(() => {
    if (activeConversation) return;

    let isMounted = true;

    db.getLeafMessages().then(messages => {
      if (!isMounted) return;

      setLeafMessages(messages);
    });

    return () => {
      isMounted = false;
    }
  }, [activeConversation, version, runningConversations]);

  if (!activeConversation) {
    return <LeafMessages db={db} runningLeafMessages={runningLeafMessages} leafMessages={leafMessages} onSelect={openConversation} />;
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
