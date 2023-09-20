import React from 'react';
import { Box, Button } from '@mui/material';
import { Message } from '../../chat/conversation';
import MarkdownRenderer from './markdownRenderer';
import CopyButton from './copyButton';
import PruneButton from './pruneButton';
import EditButton from './editButton';
import { emojiSha } from '../../chat/emojiSha';
import { MessageDB, isMessageDB } from '../../chat/conversationDb';

type MessageProps = {
  message: Message | MessageDB;
  hash?: string;
  openConversation?: (hash: string) => void;
  onPrune?: (hash: string) => void;
  onEdit?: (message: MessageDB) => void;
  openOtherHash?: (hash: string) => void;
};

const MessageBox: React.FC<MessageProps> = ({ message, hash, openConversation, onPrune, onEdit, openOtherHash }) => {
  let alignSelf: 'flex-end' | 'flex-start' | 'center';
  let backgroundColor: string;
  let textColor: string;

  console.log("MessageBox render!", message, hash, openConversation, onPrune, onEdit, openOtherHash)

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
        {onPrune && hash && <PruneButton onClick={() => onPrune(hash)} />}
        {onEdit && isMessageDB(message) && <EditButton onClick={() => onEdit(message)} />}
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
            onClick={() => openConversation && openConversation(hash)}
          >
{emojiSha(hash, 5)}

          </Button>
        }

      </div>
    </Box>
  );
};

function shallowEqual(object1: any, object2: any) {
  if (object1 === object2) {
    console.log("comp equal true!")
    return true;
  }

  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    console.log("comp length mismatch!")
    return false;
  }

  const everyMatch = keys1.every(key => {
    console.log("comp everyMatch key", key, object1[key], object2[key], object1[key] === object2[key])
    return object2.hasOwnProperty(key) && object1[key] === object2[key];
  });
  console.log("comp everyMatch", everyMatch, object1, object2)
  return everyMatch;
}

export default React.memo(MessageBox, shallowEqual);
