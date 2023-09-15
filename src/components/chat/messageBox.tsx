import React, { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Message } from '../../chat/conversation';
import MarkdownRenderer from './markdownRenderer';
import CopyButton from './copyButton';
import ForkButton from './forkButton';
import PruneButton from './pruneButton';
import EditButton from './editButton';
import { ErrorMessage } from './conversationModal';

type MessageProps = {
  message: Message | ErrorMessage;
  openConversation?: () => void;
  onPrune?: () => void;
  onEdit?: () => void;
  openOtherHash: (hash: string) => void;
};

const MessageBox: React.FC<MessageProps> = ({ message, openConversation, onPrune, onEdit, openOtherHash }) => {
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
    case 'error':
      alignSelf = 'center';
      backgroundColor = '#111';
      textColor = '#c00';
      break;
    default:
      alignSelf = 'center';
      backgroundColor = '#4b4b4b';
      textColor = '#f5f5f5';
  }

  return (
    <Box
      sx={{
        position: 'relative',  // Make the Box position relative to place the absolute positioned CopyButton
        marginBottom: '10px',
        alignSelf: alignSelf,
        backgroundColor: backgroundColor,
        borderRadius: '10px',
        padding: '0px 20px',
        maxWidth: '70%',
        wordWrap: 'break-word',
        color: textColor,
        whiteSpace: 'pre-wrap',
      }}
    >
      <div style={{
        position: 'absolute',
        right: '-10px',
        top: '-5px',
        display: 'flex',
        zIndex: 10,
      }}>
        {onPrune && <PruneButton onClick={onPrune} />}
        {onEdit && <EditButton onClick={onEdit} />}
        {openConversation && <ForkButton onClick={openConversation} />}
        <CopyButton contentToCopy={message.content} />
      </div>
      <div className="markdown-content">
        <MarkdownRenderer content={`\u200B${message.content}`} openOtherHash={openOtherHash} />
      </div>
    </Box>
  );
};

export default MessageBox;
