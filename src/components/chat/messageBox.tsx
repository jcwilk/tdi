import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import MarkdownRenderer from './markdownRenderer';
import CopyButton from './copyButton';
import PruneButton from './pruneButton';
import EditButton from './editButton';
import { ConversationDB, MaybePersistedMessage, MessageDB, isMessageDB } from '../../chat/conversationDb';
import AssistantIcon from '@mui/icons-material/PrecisionManufacturing';
import UserIcon from '@mui/icons-material/Person';
import SystemIcon from '@mui/icons-material/Dns';
import FunctionIcon from '@mui/icons-material/Functions';
import EmojiShaButton from './emojiShaButton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useLiveQuery } from "dexie-react-hooks"
import CornerButton from './cornerButton';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';

type MessageProps = {
  message: MaybePersistedMessage;
  onPrune: (message: MessageDB) => void;
  onEdit: (message: MessageDB) => void;
  openOtherHash: (hash: string) => void;
  openMessage: (message: MessageDB) => void;
  isTail: boolean;
};

const db = new ConversationDB();

const MessageBox: React.FC<MessageProps> = ({ message, onPrune, onEdit, openOtherHash, openMessage, isTail }) => {
  const siblings: MessageDB[] = useLiveQuery(() => {
    if (!isMessageDB(message)) {
      return [];
    }

    return db.messages.where('parentHash').equals(message.parentHash ?? "").sortBy('timestamp');
  }, [message], []);

  const siblingPos = isMessageDB(message) ? siblings.findIndex((sibling) => sibling.hash === message.hash) + 1 : 0;
  const leftSibling = isMessageDB(message) ? siblings[siblingPos - 2] ?? null : null;
  const rightSibling = isMessageDB(message) ? siblings[siblingPos] ?? null : null;

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
          left: '10px',
          right: '10px',
          bottom: '-1px',
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: '5px',
          }}
        >
          { isMessageDB(message) && (leftSibling || rightSibling) &&
            <>
              {leftSibling ?
                <CornerButton
                  onClick={() => openMessage(leftSibling)}
                  icon={<ChevronLeftIcon fontSize="inherit" />}
                />
                :
                <CornerButton
                  onClick={() => {}}
                  icon={<ChevronLeftIcon fontSize="inherit" />}
                  disabled
                />
              }
              {siblingPos}/{siblings.length}
              {rightSibling ?
                <CornerButton
                  onClick={() => openMessage(rightSibling)}
                  icon={<ChevronRightIcon fontSize="inherit" />}
                />
                :
                <CornerButton
                  onClick={() => {}}
                  icon={<ChevronRightIcon fontSize="inherit" />}
                  disabled
                />
              }
            </>
          }
        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: '5px',
          }}
        >

        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: '5px',
          }}
        >
          {isMessageDB(message) && <PruneButton onClick={() => onPrune(message)} />}
          {isMessageDB(message) && <EditButton onClick={() => onEdit(message)} />}
          <CopyButton contentToCopy={message.content} />
          {isMessageDB(message) && <EmojiShaButton hash={message.hash} openConversation={() => openMessage(message)} activeLink={!isTail} />}
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(MessageBox);
