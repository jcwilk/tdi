import React, { ReactNode } from 'react';
import { Box, Button } from '@mui/material';
import { Message } from '../../chat/conversation';
import MarkdownRenderer from './markdownRenderer';
import CopyButton from './copyButton';
import ForkButton from './forkButton';
import PruneButton from './pruneButton';
import EditButton from './editButton';
import { ErrorMessage } from './conversationModal';
import { emojiSha } from '../../chat/emojiSha';

type MessageProps = {
  message: Message | ErrorMessage;
  hash?: string;
  openConversation?: () => void;
  onPrune?: () => void;
  onEdit?: () => void;
  openOtherHash?: (hash: string) => void;
};

const MessageBox: React.FC<MessageProps> = ({ message, hash, openConversation, onPrune, onEdit, openOtherHash }) => {
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
        position: 'relative',
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
        <CopyButton contentToCopy={message.content} />
      </div>
      <div className="markdown-content">
        <MarkdownRenderer content={`\u200B${message.content}`} openOtherHash={openOtherHash ?? (() => {})} />
      </div>
      <div style={{
        position: 'absolute',
        right: '10px',
        bottom: '-5px',
        zIndex: 10,
      }}>
        {hash && // TODO: clean up the styling, fucking mess
          <Button
            variant="contained"
            style={{
              borderRadius: '18px',
              backgroundColor: '#424242', // Darker background color for dark mode
              color: '#E0E0E0', // Lighter text color for dark mode
              padding: '4px 8px',
              fontSize: '0.8rem',
              lineHeight: '1',
              minHeight: 'initial',
              maxWidth: '100%', // Allow it to take up to 100% of the container width
              overflow: 'hidden', // Hide overflow
              whiteSpace: 'nowrap', // Keep text in a single line
            }}
            onClick={() => openConversation && openConversation()}
          >
{emojiSha(hash, 5)}

          </Button>
        }

      </div>
    </Box>
  );
};

export default MessageBox;
