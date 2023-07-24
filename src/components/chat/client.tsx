import { Button, TextField, Box } from '@mui/material';
import React, { useState, useRef, useEffect } from 'react';
import { Subject, BehaviorSubject, ReplaySubject, merge } from 'rxjs';

type Message = {
  id: string;
  text: string;
  role: string
}

type MessageProps = {
  message: Message;
};

const Message: React.FC<MessageProps> = ({ message }) => {
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
      {message.text}
    </Box>
  );
};

const currentTypingMessageStream = new BehaviorSubject<string>('');
const outgoingMessageStream = new Subject<Message>();
const agentsMessageStream = new Subject<Message>();
const mergedHistoryStream = new ReplaySubject<Message>(100); // hold on to the past 100 messages

merge(outgoingMessageStream, agentsMessageStream).subscribe(mergedHistoryStream)

const Client: React.FC = () => {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<
    { id: string; text: string; role: string }[]
  >([]);

  const inputRef = useRef<any>(null);

  useEffect(() => {
    const typingSub = currentTypingMessageStream.subscribe((message: string) => {
      setText(message)
    })

    const msgSub = mergedHistoryStream.subscribe((message: Message) => {
      setMessages(priorMessages => [message, ...priorMessages]);
    })

    const outgoingSub = outgoingMessageStream.subscribe((message: Message) => {
      setText('');
      inputRef.current.focus();
    })

    return () => {
      typingSub.unsubscribe()
      msgSub.unsubscribe()
      outgoingSub.unsubscribe()
    }
  }, [])

  const sendMessage = () => {
    const newMessage = {
      id: Math.random().toString(), // Generating a random id for the message
      text: currentTypingMessageStream.getValue(),
      role: 'user',
    };
    outgoingMessageStream.next(newMessage)
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && text !== '') {
      event.preventDefault(); // To prevent form submission in case TextField is used within a form
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
          userSelect: 'none', // Prevent user selection
        }}
      >
        {messages.map((message) => (
          <Message key={message.id} message={message} />
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
          onChange={(e) => currentTypingMessageStream.next(e.target.value)}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={sendMessage}
          disabled={text === ''} // Disable button when text is empty
        >
          Send
        </Button>
      </Box>
    </Box>
  );
};

export default Client;
