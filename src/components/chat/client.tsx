import React, { useMemo, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages from './leafMessages';
import { useConversationsManager } from './useConversationManager';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ApiKeyEntry from '../api_key_entry';
import { APIKeyFetcher } from '../../api_key_storage';

const Client: React.FC = () => {
  const [apiKey, setApiKey] = useState<boolean>(!!APIKeyFetcher());

  const handleApiKeySubmit = () => {
    setApiKey(true);
  };

  if (!apiKey) {
    return <ApiKeyEntry onSubmit={handleApiKeySubmit} />;
  }

  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#1976d2',
      },
    },
  });

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

  return (
    <ThemeProvider theme={darkTheme}>
      {
        activeRunningConversation ?
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
          :
          <LeafMessages db={db} runningConversations={runningConversations} openMessage={(message: MessageDB) => openMessage(message, "gpt-3.5-turbo")} switchToConversation={switchToConversation} />
      }
    </ThemeProvider>
  );
};

export default Client;
