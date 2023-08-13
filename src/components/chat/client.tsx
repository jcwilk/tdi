import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const db = new ConversationDB();

type ActiveConversation = [string, string]; // [leafHash, uuid]

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

  useEffect(() => {
    // If the current navigation state has a new leafHash, add it to the activeConversations
    if(conversationIndex === activeConversations.length) {
      setActiveConversations(priorActiveConversations => [...priorActiveConversations, stateConversations[conversationIndex]])
    }
    // Otherwise, check if there's a uuid mismatch indicating there's been a new convo added to an earlier slot, so we need to ditch the prior later slots
    else if(conversationIndex > 0 && conversationIndex < activeConversations.length && activeConversations[conversationIndex][1] !== stateConversations[conversationIndex][1]) {
      setActiveConversations(priorActiveConversations => [...priorActiveConversations.slice(0, conversationIndex), stateConversations[conversationIndex]])
    }
  }, [conversationIndex]);

  const handleLeafMessageSelect = async (leafMessage: MessageDB) => {
    const newConversationIndex = conversationIndex + 1;
    const navigateState: NavigateState = {
      activeConversations: [...activeConversations.slice(0, newConversationIndex), [leafMessage.hash, uuidv4()]],
      conversationIndex: newConversationIndex
    };
    console.log("navigateState", navigateState)
    navigate(`?ln=${leafMessage.hash}`, { state: navigateState });
  };

  const handleLeafMessageClose = () => {
    navigate(-1); // Will revert to the previous URL
  };

  if (!activeConversations.length) {
    return <LeafMessages db={db} onSelect={handleLeafMessageSelect} />;
  }

  console.log("convesationIndex", conversationIndex)

  return (
    <>
      {activeConversations.map(([leafHash, conversationUuid], index) => (
        <ConversationModal
          key={conversationUuid}
          initialLeafHash={leafHash}
          db={db}
          open={index <= conversationIndex}
          onNewHash={(hash) => { navigate(`?ln=${hash}`, {replace: true, state: { activeConversations, conversationIndex }}) }}
          onClose={handleLeafMessageClose}
          onOpenNewConversation={handleLeafMessageSelect}
        />
      ))}
    </>
  );
};

export default Client;
