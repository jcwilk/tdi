import React, { useMemo } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages from './leafMessages';
import { useConversationsManager } from './useConversationManager';

const Client: React.FC = () => {
  const db = useMemo(() => new ConversationDB(), []);

  const {
    activeRunningConversation,
    runningConversations,
    goBack,
    minimize,
    editMessage,
    pruneMessage,
    openMessage,
    openSha,
    switchToConversation,
    changeModel,
    changeFunctions
  } = useConversationsManager(db);

  if (!activeRunningConversation) {
    return <LeafMessages db={db} runningConversations={runningConversations} openMessage={(message: MessageDB) => openMessage(message, "gpt-3.5-turbo")} switchToConversation={switchToConversation} />;
  }

  return (
    <ConversationModal
      key={activeRunningConversation.id}
      conversation={activeRunningConversation.conversation}
      onClose={goBack}
      minimize={minimize}
      editMessage={editMessage}
      pruneMessage={pruneMessage}
      openMessage={openMessage}
      openSha={openSha}
      onNewModel={changeModel}
      onFunctionsChange={changeFunctions}
    />
  );
};

export default Client;
