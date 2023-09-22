import React from 'react';
import { Box } from '@mui/material';
import { Message } from '../../chat/conversation';
import MarkdownRenderer from './markdownRenderer';
import CopyButton from './copyButton';
import PruneButton from './pruneButton';
import EditButton from './editButton';
import { MessageDB, isMessageDB } from '../../chat/conversationDb';
import AssistantIcon from '@mui/icons-material/PrecisionManufacturing';
import UserIcon from '@mui/icons-material/Person';
import SystemIcon from '@mui/icons-material/Dns';
import FunctionIcon from '@mui/icons-material/Functions';
import EmojiShaButton from './emojiShaButton';

type MessageProps = {
  message: Message | MessageDB;
  hash?: string;
  openConversation?: (hash: string) => void;
  onPrune?: (hash: string) => void;
  onEdit?: (message: MessageDB) => void;
  openOtherHash?: (hash: string) => void;
};

const MessageBox: React.FC<MessageProps> = (props) => {
  // Extracting props for better readability
  const { message, hash, openConversation, onPrune, onEdit, openOtherHash } = props;

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
            marginBlockStart: '1em',
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
          <MarkdownRenderer content={`\u200B${message.content}`} openOtherHash={openOtherHash ?? (() => {})} />
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
        {onPrune && hash && <PruneButton onClick={() => onPrune(hash)} />}
        {onEdit && isMessageDB(message) && <EditButton onClick={() => onEdit(message)} />}
        {hash && openConversation && <EmojiShaButton hash={hash} openConversation={openConversation} />}
        <CopyButton contentToCopy={message.content} />
      </Box>
    </Box>
  );
};

export default React.memo(MessageBox);
