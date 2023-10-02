import React from 'react';
import { Box } from '@mui/material';
import MarkdownRenderer from './markdownRenderer';
import CopyButton from './copyButton';
import PruneButton from './pruneButton';
import EditButton from './editButton';
import { MaybePersistedMessage, MessageDB, isMessageDB } from '../../chat/conversationDb';
import AssistantIcon from '@mui/icons-material/PrecisionManufacturing';
import UserIcon from '@mui/icons-material/Person';
import SystemIcon from '@mui/icons-material/Dns';
import FunctionIcon from '@mui/icons-material/Functions';
import EmojiShaButton from './emojiShaButton';

type MessageProps = {
  message: MaybePersistedMessage;
  onPrune: (message: MessageDB) => void;
  onEdit: (message: MessageDB) => void;
  openOtherHash: (hash: string) => void;
  openMessage: (message: MessageDB) => void;
};

const MessageBox: React.FC<MessageProps> = ({ message, onPrune, onEdit, openOtherHash, openMessage }) => {
  // Define styles
  let backgroundColor: string;
  let icon: JSX.Element; // You would define your icons here based on message role
  let textColor: string;

  switch (message.role) {
    case 'user':
      backgroundColor = '#313c46';
      textColor = '#fff';
      icon = <UserIcon />; // Replace with the actual icon component
      break;
    case 'assistant':
      backgroundColor = '#495968';
      textColor = '#f5f5f5';
      icon = <AssistantIcon />; // Replace with the actual icon component
      break;
    case 'system':
      backgroundColor = '#000';
      textColor = '#E0E0E0';  // Light gray text color
      icon = <SystemIcon />; // Replace with the actual icon component
      break;
    case 'function':
      backgroundColor = '#21282f';
      textColor = '#e1e1e1';
      icon = <FunctionIcon />; // Replace with the actual icon component
      break;
    default:
      throw new Error(`Unknown message role: ${message.role}`);
  }

  return (
    <Box
      sx={{
        backgroundColor,
        color: textColor,
        padding: '10px',
        paddingBottom: '20px',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
        }}
      >
        <Box
          component="span"
          sx={{
            marginRight: '10px',
            // Additional styles for the icon
          }}
        >
          {icon}
        </Box>
        <Box
          component="span"
          sx={{
            flex: '1',
            whiteSpace: 'pre-wrap',
          }}
        >
          <MarkdownRenderer content={message.content} openOtherHash={openOtherHash ?? (() => {})} />
        </Box>
      </Box>
      <Box
        sx={{
          position: 'absolute',
          right: '10px',
          bottom: '-1px',
          zIndex: 10,
          display: 'flex',
          gap: '5px',
        }}
      >
        {isMessageDB(message) && <PruneButton onClick={() => onPrune(message)} />}
        {isMessageDB(message) && <EditButton onClick={() => onEdit(message)} />}
        {isMessageDB(message) && <EmojiShaButton hash={message.hash} openConversation={() => openMessage(message)} />}
        <CopyButton contentToCopy={message.content} />
      </Box>
    </Box>
  );
};

export default React.memo(MessageBox);
