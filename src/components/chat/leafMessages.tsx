import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Message, getLastMessage, observeNewMessages } from '../../chat/conversation';
import { processMessagesWithHashing } from '../../chat/messagePersistence';
import { Box, Button, List, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { emojiSha } from '../../chat/emojiSha';
import { debounceTime, scan, tap } from 'rxjs';
import { RunningConversation, useConversationStore } from './useConversationStore';

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
You are an AI conversationalist. Your job is to converse with the user. Your prose, grammar, spelling, typing, etc should all be consistent with typical instant messaging discourse within the constraints of needing to put your entire response into one message to send each time. Use natural grammar rather than perfect grammar.
  `.trim(),
}

function insertSortedByTimestamp(messages: MessageDB[], message: MessageDB): MessageDB[] {
  // Find the index where the message should be inserted
  const index = messages.findIndex(msg => msg.timestamp < message.timestamp);

  if (index === -1) {
    // If no such index is found, the message is the latest and is added to the end of the array
    return [...messages, message];
  } else {
    // Otherwise, insert the message at the correct index to maintain the sorted order
    return [...messages.slice(0, index), message, ...messages.slice(index)];
  }
}

const LeafMessages: React.FC<{
  db: ConversationDB,
  openMessage: (message: MessageDB) => void,
  switchToConversation: (runningConversation: RunningConversation) => void
}> = ({ db, openMessage, switchToConversation }) => {
  const [leafMessages, setLeafMessages] = useState<MessageDB[]>([]);
  const [version, setVersion] = useState(0);

  const runningConversations = useConversationStore();

  useEffect(() => {
    const subscriptions = runningConversations.map(({conversation}) =>
      observeNewMessages(conversation).subscribe(() => {
        setVersion(prevVersion => prevVersion + 1);
      })
    );

    return () => {
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, [runningConversations]);

  const runningLeafMessages = useMemo(() => {
    const messages: RunningConversationOption[] = [];
    runningConversations.forEach(runningConversation => {
      const lastOne = getLastMessage(runningConversation.conversation);

      if(lastOne) messages.push({runningConversation, message: lastOne});
    });
    return messages;
  }, [runningConversations, version]);

  useEffect(() => {
    const subscription = db.getLeafMessages()
    .pipe(
      // Aggregate messages into an ever-growing array
      scan((acc, message) => insertSortedByTimestamp(acc, message), [] as MessageDB[]),
      // Debounce the aggregated message array emission
      debounceTime(10), // Adjust the debounce time as needed
      tap(aggregatedMessages => {
        setLeafMessages(aggregatedMessages);
      })
    ).subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [version, runningConversations]);

  const handleNewConversation = useCallback(async () => {
    const firstMessage = await processMessagesWithHashing(mainSystemMessage);
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
          {leafMessages.map((message) => (
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
