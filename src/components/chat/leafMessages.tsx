import React, { useEffect, useState } from 'react';
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { Message } from '../../chat/conversation';
import { firstValueFrom, of } from 'rxjs';
import { processMessagesWithHashing } from '../../chat/messagePersistence';
import { Box, Button, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';

const mainSystemMessage: Message = {
  role: "system",
  content: `
You are an AI conversationalist. Your job is to converse with the user. Your prose, grammar, spelling, typing, etc should all be consistent with typical instant messaging discourse within the constraints of needing to put your entire response into one message to send each time. Use natural grammar rather than perfect grammar.
  `,
  participantId: "root"
}

const LeafMessages: React.FC<{ db: ConversationDB, onSelect: (leafMessage: MessageDB) => void }> = ({ db, onSelect }) => {
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

  return (
    <Box
      sx={{
        fontFamily: '"Roboto Mono", monospace',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#212121',
        color: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Paper elevation={3} sx={{ padding: '20px' }}>
        <Typography variant="h4" align="center" gutterBottom>
          Conversations
        </Typography>
        <List component="nav">
          {leafMessages.map((message) => (
            <ListItem
              button
              key={message.hash}
              onClick={() => onSelect(message)}
              sx={{
                backgroundColor: '#616161',
                color: '#f5f5f5',
                '&:hover': {
                  backgroundColor: '#757575',
                },
              }}
            >
              <ListItemText primary={message.content} />
            </ListItem>
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
      </Paper>
    </Box>
  );
};

export default LeafMessages;
