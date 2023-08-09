import React, { useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal'; // Make sure you have this path right.
import LeafMessages from './leafMessages';

const db = new ConversationDB();

const Client: React.FC = () => {
  const [activeConversations, setActiveConversations] = useState<MessageDB[]>([]);

  const handleLeafMessageSelect = (leafMessage: MessageDB) => {
    setActiveConversations(prev => [...prev, leafMessage]);
  };

  if (activeConversations.length === 0) {
    return <LeafMessages db={db} onSelect={handleLeafMessageSelect} />;
  }

  return (
    <>
      {activeConversations.map((leafMessage, index) => (
        <ConversationModal
          key={leafMessage.hash}
          activeLeafMessage={leafMessage}
          db={db}
          onClose={() => {
            // Remove the leafMessage from activeConversations when closing.
            setActiveConversations(prev => prev.filter(lm => lm.hash !== leafMessage.hash));
          }}
          onOpenNewConversation={handleLeafMessageSelect} // If you want to allow opening a new conversation from within a conversation.
        />
      ))}
    </>
  );
};

export default Client;
