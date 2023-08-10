import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages from './leafMessages';
import { useNavigate, useLocation } from 'react-router-dom';

const db = new ConversationDB();

const Client: React.FC = () => {
  const [activeConversations, setActiveConversations] = useState<MessageDB[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const currentLeafHash = params.get('ln');

  // Effect to watch for URL changes
  useEffect(() => {
    if (currentLeafHash) {
      const foundIndex = activeConversations.findIndex(lm => lm.hash === currentLeafHash);
      if (foundIndex !== -1) {
        setActiveConversations(activeConversations.slice(0, foundIndex + 1));
      } else {
        db.getMessageByHash(currentLeafHash).then(foundLeafMessage => {
          if (foundLeafMessage) {
            setActiveConversations(prev => [...prev, foundLeafMessage]);
          }
        })
      }
    }
  }, [currentLeafHash]);

  const handleLeafMessageSelect = async (leafMessage: MessageDB) => {
    navigate(`?ln=${leafMessage.hash}`); // Then navigate
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
          key={leafMessage.hash}
          activeLeafMessage={leafMessage}
          db={db}
          onClose={handleLeafMessageClose}
          onOpenNewConversation={handleLeafMessageSelect}
        />
      ))}
    </>
  );
};

export default Client;
