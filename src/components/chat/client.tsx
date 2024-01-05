import React, { useMemo } from 'react';
import { ConversationDB } from '../../chat/conversationDb';
import ConversationModal from './conversationModal';
import LeafMessages from './leafMessages';
import { useConversationsManager } from './useConversationManager';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const Client: React.FC = () => {
  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
    },
  });

  const db = useMemo(() => new ConversationDB(), []);

  const {
    runningConversation,
    closeConvo,
    minimize,
    editMessage,
    pruneMessage,
    openMessage,
    openSha,
    switchToConversation,
    changeModel,
    changeFunctions,
    isIndexTrue
  } = useConversationsManager(db);

  return (
    <ThemeProvider theme={darkTheme}>
      {
        isIndexTrue ?
          <LeafMessages openMessage={openMessage} switchToConversation={switchToConversation} db={db} />
          :
          runningConversation &&
          <ConversationModal
            key={runningConversation.id}
            db={db}
            runningConversation={runningConversation}
            onClose={closeConvo}
            minimize={minimize}
            editMessage={editMessage}
            pruneMessage={pruneMessage}
            openMessage={openMessage}
            openSha={openSha}
            onNewModel={changeModel}
            onFunctionsChange={changeFunctions}
            switchToConversation={switchToConversation}
          />
      }
    </ThemeProvider>
  );
};

export default Client;
