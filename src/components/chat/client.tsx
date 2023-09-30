import React, { useMemo } from 'react';
import { ConversationDB } from '../../chat/conversationDb';
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
    openMessage,
    openSha,
    switchToConversation,
    changeModel,
    changeFunctions
  } = useConversationsManager(db);

  if (!activeRunningConversation) {
    return <LeafMessages db={db} runningConversations={runningConversations} openMessage={openMessage} switchToConversation={switchToConversation} />;
  }

  return (
    <ConversationModal
      key={activeRunningConversation.id}
      conversation={activeRunningConversation.conversation}
      onClose={goBack}
      minimize={minimize}
      openMessage={openMessage}
      openSha={openSha}
      onNewModel={changeModel}
      onFunctionsChange={changeFunctions}
    />
  );
};

export default Client;
