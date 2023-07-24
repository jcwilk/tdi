import React, { useEffect, useState, useRef } from 'react';
import { TextField, Button, Box } from '@mui/material';
import { createParticipant } from '../../chat/participantSubjects';
import { Message, createConversation, addParticipant } from '../../chat/conversation';

type MessageProps = {
  message: Message;
};

const MessageBox: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <Box
      sx={{
        marginBottom: '10px',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        backgroundColor: isUser ? '#1976d2' : '#616161',
        borderRadius: '10px',
        padding: '10px',
        maxWidth: '70%',
        wordWrap: 'break-word',
        color: isUser ? '#fff' : '#f5f5f5',
      }}
    >
      {message.content}
    </Box>
  );
};

const Client: React.FC = () => {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const [conversation, setConversation] = useState(
    addParticipant(
      addParticipant(createConversation(), createParticipant('user')),
      createParticipant('assistant')
    )
  );

  const user = conversation.participants.find(participant => participant.role === 'user')!;
  const assistant = conversation.participants.find(participant => participant.role === 'assistant')!;

  const { outgoingMessageStream$, typingAggregationOutput$ } = conversation;

  const inputRef = useRef<any>(null);

  useEffect(() => {
    const typingSub = typingAggregationOutput$.subscribe((typing: Map<string, string>) => {
      setText(typing.get(user.id) || '');
    });

    const msgSub = outgoingMessageStream$.subscribe((message: Message) => {
      setMessages(previousMessages => [message, ...previousMessages]);
    });

    const outgoingSub = outgoingMessageStream$.subscribe(() => {
      setText('');
      inputRef.current.focus();
    });

    return () => {
      typingSub.unsubscribe();
      msgSub.unsubscribe();
      outgoingSub.unsubscribe();
    };
  }, [outgoingMessageStream$, typingAggregationOutput$]);

  const sendMessage = () => {
    const newMessage: Message = {
      id: Math.random().toString(),
      participantId: user.id,
      content: text,
      role: 'user',
    };
    user.sendingStream.next(newMessage);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && text !== '') {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <Box
      sx={{
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
          userSelect: 'none',
        }}
      >
        {messages.map((message) => (
          <MessageBox key={message.id} message={message} />
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
          onChange={(e) => user.typingStreamInput$.next(e.target.value)}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={sendMessage}
          disabled={text === ''}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
};

export default Client;
