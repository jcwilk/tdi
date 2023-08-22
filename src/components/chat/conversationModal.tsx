import React, { useEffect, useState, useRef } from 'react';
import { Box, Dialog, Slide, TextField, Button, AppBar, Toolbar, IconButton, Typography } from '@mui/material';
import { TransitionProps } from '@mui/material/transitions';
import { sendMessage, typeMessage } from '../../chat/participantSubjects';
import { Conversation } from '../../chat/conversation';
import MessageBox from './messageBox'; // Assuming you've also extracted the MessageBox into its own file.
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import CloseIcon from '@mui/icons-material/Close';
import { emojiSha } from '../../chat/emojiSha';
import { Mic } from '@mui/icons-material';
import { getTranscription } from '../../openai_api';

type ConversationModalProps = {
  conversation: Conversation;
  onClose: () => void;
  onOpenNewConversation: (leafMessage: MessageDB) => void; // Callback for opening a new conversation on top
  onNewHash: (hash: string) => void;
};

const ConversationModal: React.FC<ConversationModalProps> = ({ conversation, onClose, onOpenNewConversation, onNewHash }) => {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<MessageDB[]>([]);
  const [assistantTyping, setAssistantTyping] = useState('');
  const [stopRecording, setStopRecording] = useState<((event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => void) | null>(null);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    console.log("messages", messages)
  }, [messages])

  const currentLeafHash = messages[0]?.hash;

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
      console.log("TEARDOWN MODAL")
    };
  }, [outgoingMessageStream, typingAggregationOutput]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(user);
    }
  };

  // Placeholder function to start recording
  const startRecording = async (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    const { getTranscript } = await getTranscription();

    setStopRecording(() => {
      return async () => {
        setStopRecording(null);
        const transcript = await getTranscript();
        typeMessage(user, transcript);
        sendMessage(user);
      }
    });
  };

  if (!conversation) {
    return null; // Or you can render some loading state.
  }

  const user = conversation.participants.find((participant) => participant.role === 'user')!;
  const assistant = conversation.participants.find((participant) => participant.role === 'assistant')!;

  console.log("OPEN", open)
  if (!open) return null;

  return (
    <Dialog fullScreen open onClose={onClose}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          fontFamily: '"Roboto Mono", monospace',
          backgroundColor: '#212121',
          color: '#f5f5f5',
        }}
      >
        <AppBar sx={{ position: 'relative' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => onClose()}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              {currentLeafHash && emojiSha(currentLeafHash, 5)}
            </Typography>
          </Toolbar>
        </AppBar>

        <Box
          sx={{
            flexGrow: 1,
            overflowY: 'auto',
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
          <IconButton
            component={  'button'}
            sx={{ marginRight: '10px' }}
            onMouseDown={startRecording as (event: React.MouseEvent<HTMLButtonElement> | undefined) => void}
            onMouseUp={stopRecording as (event: React.MouseEvent<HTMLButtonElement> | undefined) => void}
            onTouchStart={startRecording as (event: React.TouchEvent<HTMLButtonElement> | undefined) => void}
            onTouchEnd={stopRecording as (event: React.TouchEvent<HTMLButtonElement> | undefined) => void}
          >
            <Mic />
          </IconButton>
          <TextField
            sx={{ flexGrow: 1, marginRight: '10px' }}
            label="Message"
            variant="outlined"
            multiline
            maxRows={10}
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
