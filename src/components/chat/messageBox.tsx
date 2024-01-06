import React, { useState } from 'react';
import { Badge, Box } from '@mui/material';
import MarkdownRenderer from './markdownRenderer';
import CopyButton from './copyButton';
import PruneButton from './pruneButton';
import EditButton from './editButton';
import { ConversationDB, MaybePersistedMessage, PersistedMessage, PreloadedMessage, isPersistedMessage, isPreloadedMessage } from '../../chat/conversationDb';
import AssistantIcon from '@mui/icons-material/PrecisionManufacturing';
import UserIcon from '@mui/icons-material/Person';
import SystemIcon from '@mui/icons-material/Dns';
import FunctionIcon from '@mui/icons-material/Functions';
import EmojiShaButton from './emojiShaButton';
import { useLiveQuery } from "dexie-react-hooks"
import CornerButton from './cornerButton';
import InfoIcon from '@mui/icons-material/Info';
import MessageDetails from './messageDetails';
import PauseIcon from '@mui/icons-material/Pause';
import { RunningConversation, useTypingWatcher } from './useConversationStore';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { MessageWithSummary, SiblingsDialog } from './messageBoxDialogs';
import PinButton from './pinButton';
import { possiblyEmbellishedMessageToMarkdown } from '../../chat/functionCalling';
import { isAPIKeySet } from '../../api_key_storage';
import { Conversation, Message } from '../../chat/conversation';

const ContentRenderer: React.FC<{ db: ConversationDB, message: Message | PreloadedMessage; openOtherHash: (hash: string) => void }> = ({ db, message, openOtherHash }) => {
  const content = isPreloadedMessage(message) ? possiblyEmbellishedMessageToMarkdown(db, message) : message.content;

  return <MarkdownRenderer content={content} openOtherHash={openOtherHash ?? (() => {})} />;
};

type MessageProps = {
  db: ConversationDB;
  message: Message | PreloadedMessage;
  conversation: Conversation;
  onPrune: (message: PersistedMessage) => void;
  onEdit: (message: PersistedMessage) => void;
  openOtherHash: (hash: string) => void;
  openMessage: (message: PersistedMessage) => void;
  isTail: boolean;
  switchToConversation: (runningConversation: RunningConversation) => void;
};

const MessageBox: React.FC<MessageProps> = ({ db, message, conversation, onPrune, onEdit, openOtherHash, openMessage, isTail, switchToConversation }) => {
  const [openDetails, setOpenDetails] = useState(false);
  const [livePreloadedMessage, setLivePreloadedMessage] = useState<PreloadedMessage | Message>(message);

  useLiveQuery(async () => {
    if (isPreloadedMessage(message)) {
      const preloadedMessage = await db.preloadMessage(message);
      setLivePreloadedMessage(preloadedMessage);
    }
    else {
      setLivePreloadedMessage(message);
    }
  }, [message], undefined);

  const siblings: MessageWithSummary[] = useLiveQuery(async () => {
    if (!isPersistedMessage(message)) {
      return [];
    }

    const messages = await db.getDirectSiblings(message);
    const pairPromises = messages.map(async message => {
      const summary = await db.summaries.get(message.hash);
      return {
        message,
        summary: summary?.summary ?? null
      }
    })
    return await Promise.all(pairPromises)
  }, [message], []);

  const [incompletePersistence, summary]: [boolean | undefined, string | undefined] = useLiveQuery(async () => {
    if (!isPersistedMessage(message)) {
      return [undefined, undefined];
    }

    const [summary, embedding, summaryEmbedding] = await Promise.all([
      db.getSummaryByHash(message.hash),
      db.getEmbeddingByHash(message.hash),
      db.getSummaryEmbeddingByHash(message.hash),
    ]);

    return [!(summary && embedding && summaryEmbedding), summary?.summary ?? ""] as [boolean, string];
  }, [message], [undefined, undefined]);

  const siblingPos = isPersistedMessage(message) ? siblings.findIndex((sibling) => sibling.message.hash === message.hash) + 1 : 0;

  const [openSiblings, setOpenSiblings] = useState(false);

  const siblingsTyping = isPersistedMessage(message) ? Object.values(useTypingWatcher(message, "siblings")).map(({runningConversation}) => runningConversation) : [];

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
      throw new Error(`Unknown message role: ${message}`);
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
          {
            incompletePersistence
            ?
            <Badge badgeContent={<PauseIcon fontSize='inherit' />} color="primary">{icon}</Badge>
            :
            icon
          }
        </Box>
        <Box
          component="span"
          sx={{
            flex: '1',
            whiteSpace: 'pre-wrap',
          }}
        >
          <ContentRenderer db={db} message={livePreloadedMessage} openOtherHash={openOtherHash} />
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
            gap: '2px',
          }}
        >
          { isPersistedMessage(message) && (siblings.length > 1) &&
            <>
              <CornerButton
                onClick={() => setOpenSiblings(true)}
                icon={
                  <>
                    <CompareArrowsIcon fontSize='inherit' />
                    {siblingPos}/{siblings.length}
                    {Object.keys(siblingsTyping).length > 0 && <KeyboardIcon fontSize="inherit" />}
                  </>
                }
              />
            </>
          }
        </Box>
        <Box
          sx={{
            display: 'flex',
            gap: '2px',
          }}
        >
          {isPersistedMessage(message) && <PruneButton onClick={() => onPrune(message)} />}
          {isPersistedMessage(message) && <EditButton onClick={() => onEdit(message)} />}
          {isAPIKeySet() &&
            isPersistedMessage(message) && <PinButton message={message} />
          }
          <CopyButton contentToCopy={message.content} />
          {isPersistedMessage(message) && <CornerButton onClick={() => setOpenDetails(true)} icon={<InfoIcon fontSize="inherit" />} />}
          {isPersistedMessage(message) && <EmojiShaButton hash={message.hash} openConversation={() => openMessage(message)} activeLink={!isTail} />}
        </Box>
      </Box>
      { isPersistedMessage(message) &&
        <>
          { incompletePersistence !== undefined && summary !== undefined &&
            <MessageDetails open={openDetails} onClose={() => setOpenDetails(false)} message={message} conversation={conversation} openOtherHash={openOtherHash} incompletePersistence={incompletePersistence} summary={summary} />
          }
          <SiblingsDialog open={openSiblings} onClose={() => setOpenSiblings(false)} onSelectMessage={openMessage} switchToConversation={switchToConversation} messagesWithSummaries={siblings} siblingsTyping={siblingsTyping} />
        </>
      }
    </Box>
  );
};

export default React.memo(MessageBox);
