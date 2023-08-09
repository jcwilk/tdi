import React, {  } from 'react';
import { Box } from '@mui/material';
import { Message } from '../../chat/conversation';
import ReactMarkdown from 'react-markdown';

type MessageProps = {
  message: Message;
  openConversation?: () => void;
};

const MessageBox: React.FC<MessageProps> = ({ message, openConversation }) => {
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
      <div className="markdown-content" onClick={openConversation}>  {/* Add a wrapper div with class */}
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
    </Box>
  );
};

export default MessageBox;
