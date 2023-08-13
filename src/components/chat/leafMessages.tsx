import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Message } from '../../chat/conversation';
import { firstValueFrom, of } from 'rxjs';
import { processMessagesWithHashing } from '../../chat/messagePersistence';
import { Box, Button, List, ListItem, ListItemButton, ListItemText, Paper, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { emojiSha } from '../../chat/emojiSha';

// Define the striped styling
const StripedListItem = styled(ListItemButton)`
&:nth-child(odd) {
  background-color: #333; // Dark base color for odd items
}
&:nth-child(even) {
  background-color: #444; // Slightly lighter shade for even items
}
`;

export type RunningConversationOption = {
  uuid: string;
  message: MessageDB;
}

const mainSystemMessage: Message = {
  role: "system",
  content: `
You are an AI conversationalist. Your job is to converse with the user. Your prose, grammar, spelling, typing, etc should all be consistent with typical instant messaging discourse within the constraints of needing to put your entire response into one message to send each time. Use natural grammar rather than perfect grammar.
  `,
  participantId: "root"
}

const LeafMessages: React.FC<{ db: ConversationDB, runningLeafMessages: RunningConversationOption[], onSelect: (leafMessage: MessageDB, uuid?: string) => void }> = ({ db, runningLeafMessages, onSelect }) => {
  const [leafMessages, setLeafMessages] = useState<MessageDB[]>([]);

  useEffect(() => {
    const fetchLeafMessages = async () => {
      const messages = await db.getLeafMessages();
      console.log("Leaf messages: ", messages);
      setLeafMessages(messages);
    };
    fetchLeafMessages();
  }, []);

  const handleNewConversation = async () => {
    const firstMessage = await firstValueFrom(processMessagesWithHashing(of(mainSystemMessage)));
    onSelect(firstMessage);
  }

  // TODO: there's some bug with not being able to pull up more than the primary running conversation, despite them all showing up
  return (
    <Box
    >
      <Paper elevation={3} sx={{ padding: '20px' }}>
        <Typography variant="h4" align="center" gutterBottom>
          Running Conversations
        </Typography>
        <List>
          {runningLeafMessages.map(({uuid, message}) => (
            <StripedListItem key={message.hash} onClick={() => onSelect(message, uuid)}>
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
            <StripedListItem key={message.hash} onClick={() => onSelect(message)}>
              <ListItemText primary={emojiSha(message.hash, 5) + " " + message.content} primaryTypographyProps={{ noWrap: true }} />
            </StripedListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default LeafMessages;
