import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages, { RunningConversationOption } from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { createParticipant } from '../../chat/participantSubjects';
import { Conversation, addParticipant, createConversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import { emojiSha } from '../../chat/emojiSha';

const db = new ConversationDB();

type ActiveConversation = {
  leafHash: string,
  uuid: string
};

type NavigateState = {
  activeConversation: ActiveConversation; // [leafHash, uuid]
  conversationIndex: number;
};

const Client: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const currentLeafHash = params.get('ln');

  const stateConversation: ActiveConversation | null = location.state?.activeConversation;
  const conversationIndex: number = location.state?.conversationIndex ?? -1;

  const [activeConversations, setActiveConversations] = useState<ActiveConversation[]>([]);
  const [runningConversations, setRunningConversations] = useState<Map<string, Conversation>>(new Map<string, Conversation>());

  console.log("activeConversations", activeConversations)
  console.log("runningConversations", runningConversations)
  console.log("conversationIndex", conversationIndex)
  console.log("stateConversation", stateConversation)

  const handleLeafMessageSelect = async (leafMessage: MessageDB, uuid: string = "") => {
    const newConversationIndex = conversationIndex + 1;
    const initialLeafHash = leafMessage.hash;

    console.log("STARTING CONVO", emojiSha(initialLeafHash, 5), initialLeafHash, "|"+uuid+"|", newConversationIndex)

    if(uuid === "") uuid = uuidv4();

    if (!runningConversations.has(uuid)) {
      const conversationFromDb = await db.getConversationFromLeaf(initialLeafHash);
      console.log('conversation', conversationFromDb);

      const conversation = addAssistant(addParticipant(createConversation(conversationFromDb), createParticipant('user')));
      setRunningConversations(runningConversations => new Map(runningConversations).set(uuid, conversation))
    }

    const navigateState: NavigateState = {
      activeConversation: {leafHash: initialLeafHash, uuid},
      conversationIndex: newConversationIndex
    };
    console.log("navigateState", navigateState)

    navigate(`?ln=${initialLeafHash}`, { state: navigateState });
  };

  useEffect(() => {
    if (currentLeafHash && !stateConversation) {
      db.getMessageByHash(currentLeafHash).then(message => {
        if (message) {
          handleLeafMessageSelect(message);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (stateConversation) {
      // If the current navigation state has a new leafHash, add it to the activeConversations
      if(conversationIndex === activeConversations.length && currentLeafHash) {
        console.log("ADDING NEW CONVO", emojiSha(currentLeafHash, 5), currentLeafHash, conversationIndex)
        setActiveConversations(priorActiveConversations => [...priorActiveConversations, stateConversation])
      }
      // Otherwise, check if there's a uuid mismatch indicating there's been a new convo added to an earlier slot, so we need to ditch the prior later slots
      else if(conversationIndex < activeConversations.length && activeConversations[conversationIndex].uuid !== stateConversation.uuid) {
        console.log("REPLACING CONVO", emojiSha(stateConversation.leafHash, 5), currentLeafHash, conversationIndex)
        // TODO: there seems to be a render jitter here
        setActiveConversations(priorActiveConversations => [...priorActiveConversations.slice(0, conversationIndex), stateConversation])
      }
    }
  }, [conversationIndex]);



  const handleLeafMessageClose = () => {
    navigate(-1); // Will revert to the previous URL
  };

  if (!activeConversations.length || conversationIndex < 0) {
    const runningLeafMessages: RunningConversationOption[] = [];
    for (const [uuid, conversation] of runningConversations) {
      // subscribe to the convo and add each last message to the runningLeafHashes, then immediately unsubscribe.

      let lastOne: MessageDB | null = null;
      conversation.outgoingMessageStream.subscribe((message) => {
        lastOne = message;
      }).unsubscribe();

      if(lastOne) runningLeafMessages.push({uuid, message: lastOne});
    };
    return <LeafMessages db={db} runningLeafMessages={runningLeafMessages} onSelect={handleLeafMessageSelect} />;
  }

  return (
    <>
      {activeConversations.map(({leafHash, uuid}, index) => {
        const conversation = runningConversations.get(uuid);
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
