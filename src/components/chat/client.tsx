import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';

const db = new ConversationDB();

const Client: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const currentLeafHash = params.get('ln');
  const activeConversations: MessageDB[] = location.state?.activeConversations || [];

  const handleLeafMessageSelect = async (leafMessage: MessageDB) => {
    navigate(`?ln=${leafMessage.hash}`, { state: { activeConversations: [...activeConversations, leafMessage] }}); // Then navigate
  };

  const handleLeafMessageClose = (leafMessage: MessageDB) => {
    navigate(-1); // Will revert to the previous URL
  };

  if (!activeConversations.length) {
    return <LeafMessages db={db} onSelect={handleLeafMessageSelect} />;
  }

  return (
    <>
      {activeConversations.map((leafMessage, index) => (
        <ConversationModal
          key={`${leafMessage.hash}_${index}`}
          activeLeafMessage={leafMessage}
          onNewHash={(hash) => { navigate(`?ln=${hash}`, {replace: true, state: { activeConversations }}) }}
          db={db}
          onClose={handleLeafMessageClose}
          onOpenNewConversation={handleLeafMessageSelect}
          navigate={navigate}
        />
      ))}
    </>
  );
};

export default Client;
