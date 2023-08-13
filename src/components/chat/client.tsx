import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages, { RunningConversationOption } from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { createParticipant } from '../../chat/participantSubjects';
import { Conversation, addParticipant, createConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';

const db = new ConversationDB();

type ActiveConversation = {
  leafHash: string,
  uuid: string
};

type NavigateState = {
  activeConversations: ActiveConversation[]; // [leafHash, uuid]
  conversationIndex: number;
};

const Client: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const currentLeafHash = params.get('ln');

  const defaultIndex = currentLeafHash ? 0 : -1;
  const defaultConversations = currentLeafHash ? [[currentLeafHash, uuidv4()]] : [];

  const stateConversations: ActiveConversation[] = location.state?.activeConversations || defaultConversations;
  const conversationIndex: number = location.state?.conversationIndex ?? defaultIndex;

  const [activeConversations, setActiveConversations] = useState<ActiveConversation[]>([]);
  const [runningconversations, setRunningConversations] = useState<Map<string, Conversation>>(new Map<string, Conversation>());

  useEffect(() => {
    // If the current navigation state has a new leafHash, add it to the activeConversations
    if(conversationIndex === activeConversations.length) {
      setActiveConversations(priorActiveConversations => [...priorActiveConversations, stateConversations[conversationIndex]])
    }
    // Otherwise, check if there's a uuid mismatch indicating there's been a new convo added to an earlier slot, so we need to ditch the prior later slots
    else if(conversationIndex > 0 && conversationIndex < activeConversations.length && activeConversations[conversationIndex].uuid !== stateConversations[conversationIndex].uuid) {
      setActiveConversations(priorActiveConversations => [...priorActiveConversations.slice(0, conversationIndex), stateConversations[conversationIndex]])
    }
  }, [conversationIndex]);

  const handleLeafMessageSelect = async (leafMessage: MessageDB, uuid: string = "") => {
    const newConversationIndex = conversationIndex + 1;
    const initialLeafHash = leafMessage.hash;

    console.log("STARTING CONVO", initialLeafHash, db)

    const conversationFromDb = await db.getConversationFromLeaf(initialLeafHash);

    console.log('conversation', conversationFromDb);
    const conversation = addAssistant(addParticipant(createConversation(conversationFromDb), createParticipant('user')));

    if(uuid === "") uuid = uuidv4();

    setRunningConversations(runningconversations => new Map(runningconversations).set(uuid, conversation));

    const navigateState: NavigateState = {
      activeConversations: [...activeConversations.slice(0, newConversationIndex), {leafHash: leafMessage.hash, uuid}],
      conversationIndex: newConversationIndex
    };
    console.log("navigateState", navigateState)
    navigate(`?ln=${leafMessage.hash}`, { state: navigateState });
  };

  const handleLeafMessageClose = () => {
    navigate(-1); // Will revert to the previous URL
  };

  if (!activeConversations.length || conversationIndex < 0) {
    const runningLeafMessages: RunningConversationOption[] = [];
    for (const [uuid, conversation] of runningconversations) {
      // subscribe to the convo and add each last message to the runningLeafHashes, then immediately unsubscribe.
      const subs = [];
      let lastOne: MessageDB;
      const subscription = conversation.outgoingMessageStream.subscribe((message) => {
        lastOne = message;
      });
      subscription.unsubscribe();
      if(lastOne) runningLeafMessages.push({uuid, message: lastOne});
    };
    return <LeafMessages db={db} runningLeafMessages={runningLeafMessages} onSelect={handleLeafMessageSelect} />;
  }

  return (
    <>
      {activeConversations.map(({leafHash, uuid}, index) => {
        const conversation = runningconversations.get(uuid);
        if(!conversation) return null;

        return (
          <ConversationModal
            key={uuid}
            initialLeafHash={leafHash}
            db={db}
            open={index <= conversationIndex}
            conversation={conversation}
            onNewHash={(hash) => { navigate(`?ln=${hash}`, {replace: true, state: { activeConversations, conversationIndex }}) }}
            onClose={handleLeafMessageClose}
            onOpenNewConversation={handleLeafMessageSelect}
          />
        );
      })}
    </>
  );
};

export default Client;
