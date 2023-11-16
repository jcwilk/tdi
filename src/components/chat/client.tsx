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
        runningConversation ?
          <ConversationModal
            key={runningConversation.id}
            conversation={runningConversation.conversation}
            onClose={goBack}
            minimize={minimize}
            editMessage={editMessage}
            pruneMessage={pruneMessage}
            openMessage={openMessage}
            openSha={openSha}
            onNewModel={changeModel}
            onFunctionsChange={changeFunctions}
            switchToConversation={switchToConversation}
          />
          :
          <LeafMessages openMessage={openMessage} switchToConversation={switchToConversation} db={db} />
      }
    </ThemeProvider>
  );
};

export default Client;
