import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages, { RunningConversationOption } from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';
import { createParticipant } from '../../chat/participantSubjects';
import { Conversation, addParticipant, createConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import { emojiSha } from '../../chat/emojiSha';
import { ReplaySubject, pluck } from 'rxjs';

const db = new ConversationDB();

type NavigateState = {
  activeConversations: string[]; // [uuid, ...]
};

function pluckLast<T>(subject: ReplaySubject<T>): T | null {
  let lastValue: T | null = null;
  const subscription = subject.subscribe((value) => {
    lastValue = value;
  });
  subscription.unsubscribe();
  return lastValue;
}

const Client: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);

  const [runningConversations, setRunningConversations] = useState<Map<string, Conversation>>(new Map<string, Conversation>());

  const stateConversations: string[] = location.state?.activeConversations ?? [];

  const activeConversations: Conversation[] = stateConversations.map(uuid => runningConversations.get(uuid)).filter(result => result !== undefined) as Conversation[];
  const currentLeafHash = (() => {
    const paramLeafHash = params.get('ln');
    if (activeConversations.length === 0) return paramLeafHash;

    const topConversation = activeConversations[activeConversations.length - 1];
    const lastMessage = pluckLast(topConversation.outgoingMessageStream);
    if (lastMessage) return lastMessage.hash;

    return paramLeafHash;
  })()

  console.log("activeConversations", activeConversations)
  console.log("runningConversations", runningConversations)
  console.log("stateConversations", stateConversations)

  const handleLeafMessageSelect = async (leafMessage: MessageDB, uuid: string = "") => {
    const initialLeafHash = leafMessage.hash;

    console.log("STARTING CONVO", emojiSha(initialLeafHash, 5), initialLeafHash, "|"+uuid+"|")

    if (!runningConversations.has(uuid)) {
      const conversationFromDb = await db.getConversationFromLeaf(initialLeafHash);
      console.log('conversation', conversationFromDb);

      const conversation = addAssistant(addParticipant(createConversation(conversationFromDb), createParticipant('user')));
      setRunningConversations(runningConversations => new Map(runningConversations).set(conversation.id, conversation))
      uuid = conversation.id;
    }

    const navigateState: NavigateState = {
      activeConversations: [...activeConversations.map(({ id }) => id), uuid]
    };
    console.log("navigateState", navigateState)

    navigate(`?ln=${initialLeafHash}`, { state: navigateState });
  };

  useEffect(() => {
    if (currentLeafHash && activeConversations.length === 0) {
      db.getMessageByHash(currentLeafHash).then(message => {
        navigate("?", {replace: true, state: {}})

        if (message) {
          handleLeafMessageSelect(message);
        }
      });
    }

    return () => {
      runningConversations.forEach(conversation => conversation.teardown())
    }
  }, []);

  const handleLeafMessageClose = () => {
    navigate(-1); // Will revert to the previous URL
  };

  if (!activeConversations.length) {
    const runningLeafMessages: RunningConversationOption[] = [];
    for (const [uuid, conversation] of runningConversations) {
      // subscribe to the convo and add each last message to the runningLeafHashes, then immediately unsubscribe.

      const lastOne = pluckLast(conversation.outgoingMessageStream);

      if(lastOne) runningLeafMessages.push({uuid, message: lastOne});
    };
    return <LeafMessages db={db} runningLeafMessages={runningLeafMessages} onSelect={handleLeafMessageSelect} />;
  }

  return (
    <>
      { /* TODO: we could hypothetically render only the top convo - having them all rendered helps for transitions, but I removed them for now for simplicity */ }
      {activeConversations.map((conversation, index) => {
        return (
          <ConversationModal
            key={conversation.id}
            conversation={conversation}
            onNewHash={(hash) => { navigate(`?ln=${hash}`, {replace: true, state: { activeConversations: activeConversations.map(({ id }) => id) }}) }}
            onClose={handleLeafMessageClose}
            onOpenNewConversation={handleLeafMessageSelect}
          />
        );
      })}
    </>
  );
};

export default Client;
