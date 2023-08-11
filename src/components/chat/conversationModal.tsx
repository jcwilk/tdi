import React, { useEffect, useState, useRef } from 'react';
import { Box, Dialog, Slide, TextField, Button, AppBar, Toolbar, IconButton, Typography } from '@mui/material';
import { TransitionProps } from '@mui/material/transitions';
import { createParticipant, sendMessage, typeMessage } from '../../chat/participantSubjects';
import { addParticipant, Conversation, createConversation } from '../../chat/conversation';
import MessageBox from './messageBox'; // Assuming you've also extracted the MessageBox into its own file.
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import { addAssistant } from '../../chat/ai_agent';
import CloseIcon from '@mui/icons-material/Close';
import { NavigateFunction } from 'react-router-dom';

type ConversationModalProps = {
  activeLeafMessage: MessageDB;
  onClose: (activeLeafMessage: MessageDB) => void;
  onOpenNewConversation: (leafMessage: MessageDB) => void; // Callback for opening a new conversation on top
  onNewHash: (hash: string) => void;
  db: ConversationDB;
  navigate: NavigateFunction;
};

const Transition = React.forwardRef<unknown, TransitionProps>((props, ref) => {
  const { children, ...otherProps } = props;

  if (!React.isValidElement(children)) {
    return null;
  }

  return <Slide direction="up" ref={ref} {...otherProps}>{children}</Slide>;
});

const ConversationModal: React.FC<ConversationModalProps> = ({ activeLeafMessage, onClose, onOpenNewConversation, onNewHash, db, navigate }) => {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<MessageDB[]>([]);
  const [assistantTyping, setAssistantTyping] = useState('');

  const [conversation, setConversation] = useState<Conversation>();
  const inputRef = useRef<any>(null);

  useEffect(() => {
    console.log("messages", messages)
  }, [messages])

  useEffect(() => {
    return () => {
      console.log("TEARDOWN")
      if (conversation) {
        conversation.teardown();
      }
    };
  }, []);


  useEffect(() => {
    if (!conversation && db && activeLeafMessage) {
      console.log("STARTING CONVO", activeLeafMessage, db)
      db.getConversationFromLeaf(activeLeafMessage.hash).then((conversationFromDb) => {
        console.log('conversation', conversationFromDb);
        setConversation(addAssistant(addParticipant(createConversation(conversationFromDb), createParticipant('user'))));
      });
    }
  }, []);

  const currentLeafHash = messages[0]?.hash || activeLeafMessage.hash;

  useEffect(() => {
    if (currentLeafHash) {
      console.log("new hash", currentLeafHash)
      onNewHash(currentLeafHash);
    }
  }, [messages]);

  const { outgoingMessageStream, typingAggregationOutput } = conversation || {};

  useEffect(() => {
    if (!outgoingMessageStream || !typingAggregationOutput) return;

    const typingSub = typingAggregationOutput.subscribe((typing: Map<string, string>) => {
      setText(typing.get(user.id) || '');
      const messageInProgress = typing.get(assistant.id)
      if (messageInProgress) {
        setAssistantTyping(messageInProgress);
      }
    });

    const msgSub = outgoingMessageStream.subscribe((message: MessageDB) => {
      console.log("new message", message)
      setMessages((previousMessages) => [message, ...previousMessages]);
      setAssistantTyping('');
    });

    return () => {
      typingSub.unsubscribe();
      msgSub.unsubscribe();
    };
  }, [outgoingMessageStream, typingAggregationOutput]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMessage(user);
    }
  };

  if (!conversation) {
    return null; // Or you can render some loading state.
  }

  const user = conversation.participants.find((participant) => participant.role === 'user')!;
  const assistant = conversation.participants.find((participant) => participant.role === 'assistant')!;

  return (
    <Dialog fullScreen open onClose={() => onClose(activeLeafMessage)} TransitionComponent={Transition}>
      <AppBar sx={{ position: 'relative' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => onClose(activeLeafMessage)}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              {activeLeafMessage.hash}
            </Typography>
          </Toolbar>
        </AppBar>
      <Box
        sx={{
          fontFamily: '"Roboto Mono", monospace',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          backgroundColor: '#212121',
          color: '#f5f5f5',
        }}
      >
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column-reverse',
            padding: '20px',
          }}
        >
          {assistantTyping && (
            <MessageBox key="assistant-typing" message={{ participantId: 'TODO', role: 'assistant', content: assistantTyping }} />
          )}
          {messages.map((message) => (
            <MessageBox key={message.hash} message={message} openConversation={() => onOpenNewConversation(message)} />
          ))}
        </Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px',
          }}
        >
          <TextField
            sx={{ flexGrow: 1, marginRight: '10px' }}
            label="Message"
            variant="outlined"
            value={text}
            onChange={(e) => typeMessage(user, e.target.value)}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              sendMessage(user);
              inputRef.current.focus();
            }}
            disabled={text === ''}
          >
            Send
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default ConversationModal;
