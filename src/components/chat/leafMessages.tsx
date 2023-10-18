import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Message, getLastMessage, observeNewMessages } from '../../chat/conversation';
import { processMessagesWithHashing } from '../../chat/messagePersistence';
import { Box, Button, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { emojiSha } from '../../chat/emojiSha';
import { debounceTime, scan, tap } from 'rxjs';
import { RunningConversation, useConversationStore, useLeafMessageTracker } from './useConversationStore';

// Define the striped styling
const StripedListItem = styled(ListItemButton)`
&:nth-of-type(odd) {
  background-color: #333; // Dark base color for odd items
}
&:nth-of-type(even) {
  background-color: #444; // Slightly lighter shade for even items
}
`;

export type RunningConversationOption = {
  runningConversation: RunningConversation;
  message: MessageDB;
}

const mainSystemMessage: Message = {
  role: "system",
  content: `
  You are a general purpose AI assistant. Maintain a direct and concise tone throughout your interactions. Avoid the use of filler words, politeness phrases, and apologies to ensure your responses are concise and direct. Your priority should be to deliver the most relevant information first, making your responses poignant and impactful. Precision and specificity in your language are key to clear and easy comprehension.
  `.trim(),
}

const LeafMessages: React.FC<{
  openMessage: (message: MessageDB) => void,
  switchToConversation: (runningConversation: RunningConversation) => void
}> = ({ openMessage, switchToConversation }) => {
  const leafMessages = useLeafMessageTracker(null);
  const runningConversations = useConversationStore();
  const [runningLeafMessages, setRunningLeafMessages] = useState<RunningConversationOption[]>([]);

  useEffect(() => {
    function updateConvos() {
      const runningLeaves = runningConversations
        .map(runningConversation => ({ runningConversation, message: getLastMessage(runningConversation.conversation)}))
        .sort((a, b) => b.message.timestamp - a.message.timestamp)

      setRunningLeafMessages(runningLeaves)
    }

    updateConvos();

    const subscriptions = runningConversations.map(({conversation}) =>
      observeNewMessages(conversation, false).pipe(
        debounceTime(0),
        tap(updateConvos),
      ).subscribe()
    );

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, [runningConversations]);

  const handleNewConversation = useCallback(async () => {
    const firstMessage = await processMessagesWithHashing('paused', mainSystemMessage);
    openMessage(firstMessage);
  }, [openMessage]);

  return (
    <Box
    >
      <Paper elevation={3} sx={{ padding: '20px' }}>
        <Typography variant="h4" align="center" gutterBottom>
          Running Conversations
        </Typography>
        <List>
          {runningLeafMessages.map(({runningConversation, message}) => (
            <StripedListItem key={runningConversation.id} onClick={() => switchToConversation(runningConversation)}>
              <ListItemText primary={emojiSha(message.hash, 5) + " " + message.content} primaryTypographyProps={{ noWrap: true }} />
            </StripedListItem>
          ))}
        </List>
        <Box
          sx={{
            marginTop: '10px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Button
            variant="contained"
            color="primary"
            onClick={handleNewConversation}
          >
            New Conversation
          </Button>
        </Box>
        <Typography variant="h4" align="center" gutterBottom>
          Saved Conversations
        </Typography>
        <List>
          {leafMessages.map(({message}) => (
            <StripedListItem key={message.hash} onClick={() => openMessage(message)}>
              <ListItemText primary={emojiSha(message.hash, 5) + " " + message.content} primaryTypographyProps={{ noWrap: true }} />
            </StripedListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default LeafMessages;
