import React, { useEffect, useState, useRef } from 'react';
import { TextField, Button, Box } from '@mui/material';
import { createParticipant, sendMessage, typeMessage } from '../../chat/participantSubjects';
import { Message, createConversation, addParticipant, Conversation } from '../../chat/conversation';
import { addAssistant } from '../../chat/ai_agent';
import ReactMarkdown from 'react-markdown';

type MessageProps = {
  message: Message;
};

const MessageBox: React.FC<MessageProps> = ({ message }) => {
  let alignSelf: 'flex-end' | 'flex-start' | 'center';
  let backgroundColor: string;
  let textColor: string;

  switch (message.role) {
    case 'user':
      alignSelf = 'flex-end';
      backgroundColor = '#1976d2';
      textColor = '#fff';
      break;
    case 'assistant':
      alignSelf = 'flex-start';
      backgroundColor = '#616161';
      textColor = '#f5f5f5';
      break;
    case 'system':
      alignSelf = 'center';
      backgroundColor = '#000'; // Black background for system messages
      textColor = '#E0E0E0';  // Light gray text color
      break;
    default:
      alignSelf = 'center';
      backgroundColor = '#4b4b4b';
      textColor = '#f5f5f5';
  }

  return (
    <Box
      sx={{
        marginBottom: '10px',
        alignSelf: alignSelf,
        backgroundColor: backgroundColor,
        borderRadius: '10px',
        padding: '0px 20px',  // Adjusted padding: 5px vertical, 10px horizontal
        maxWidth: '70%',
        wordWrap: 'break-word',
        color: textColor,
        whiteSpace: 'pre-wrap',
      }}
    >
      <div className="markdown-content">  {/* Add a wrapper div with class */}
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
    </Box>
  );
};


const Client: React.FC = () => {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [assistantTyping, setAssistantTyping] = useState('');

  const [conversation, setConversation] = useState<Conversation>();

  useEffect(() => {
    setConversation(addAssistant(
      addParticipant(
        createConversation(),
        createParticipant('user')
      )
    ));
  }, []);

  const { outgoingMessageStream, typingAggregationOutput } = conversation || {};

  useEffect(() => {
    if(!outgoingMessageStream || !typingAggregationOutput) return;

    const typingSub = typingAggregationOutput.subscribe((typing: Map<string, string>) => {
      setText(typing.get(user.id) || '');
      setAssistantTyping(typing.get(assistant.id) || '');
    });

    const msgSub = outgoingMessageStream.subscribe((message: Message) => {
      setMessages(previousMessages => [message, ...previousMessages]);
    });

    return () => {
      typingSub.unsubscribe();
      msgSub.unsubscribe();
    };
  }, [outgoingMessageStream, typingAggregationOutput]);

  const inputRef = useRef<any>(null);

  if (!conversation) return <></>;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMessage(user);
    }
  };

  const user = conversation.participants.find(participant => participant.role === 'user')!;
  const assistant = conversation.participants.find(participant => participant.role === 'assistant')!;

  return (
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
          <MessageBox message={{ id: 'assistant-typing', participantId: 'TODO', role: 'assistant', content: assistantTyping }} />
        )}
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
          onChange={(e) => typeMessage(user, e.target.value)}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => { sendMessage(user); inputRef.current.focus(); }}
          disabled={text === ''}
        >
          Send
        </Button>
      </Box>
    </Box>
  );
};

export default Client;
