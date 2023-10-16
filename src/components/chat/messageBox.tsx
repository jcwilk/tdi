import React, { useEffect, useState } from 'react';
import { Avatar, Badge, Box, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemAvatar, ListItemButton, ListItemText, ToggleButton, ToggleButtonGroup, Toolbar, Typography } from '@mui/material';
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
import { useLiveQuery } from "dexie-react-hooks"
import CornerButton from './cornerButton';
import InfoIcon from '@mui/icons-material/Info';
import MessageDetails from './messageDetails';
import PauseIcon from '@mui/icons-material/Pause';
import { RunningConversation, useTypingWatcher } from './useConversationStore';
import { emojiSha } from '../../chat/emojiSha';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import ShortTextIcon from '@mui/icons-material/ShortText';
import SubjectIcon from '@mui/icons-material/Subject';
import { getTypingStatus } from '../../chat/conversation';

type MessageProps = {
  message: MaybePersistedMessage;
  onPrune: (message: MessageDB) => void;
  onEdit: (message: MessageDB) => void;
  openOtherHash: (hash: string) => void;
  openMessage: (message: MessageDB) => void;
  isTail: boolean;
  switchToConversation: (runningConversation: RunningConversation) => void;
};

const db = new ConversationDB();

function SiblingsDialog(props: {
  onSelectMessage: (message: MessageDB) => void,
  switchToConversation: (RunningConversation: RunningConversation) => void,
  onClose: () => void,
  open: boolean,
  messages: MessageDB[],
  siblingsTyping: RunningConversation[]
}) {
  const { onClose, open, messages, onSelectMessage, switchToConversation, siblingsTyping } = props;

  const [expand, setExpand] = useState(false);

  const handleListItemClick = (message: MessageDB) => {
    onSelectMessage(message);
    onClose();
  };

  const handleExpand = (
    _event: React.MouseEvent<HTMLElement>,
    newExpand: boolean | null,
  ) => {
    if (newExpand !== null) {
      setExpand(newExpand);
    }
  };

  // TODO: This could definitely use some cleaning up, but it's a fairly niche interface so not worth spending a lot of time on for now
  return (
    <Dialog onClose={onClose} open={open}>
      <Toolbar>
        <ToggleButtonGroup
          value={expand}
          exclusive
          onChange={handleExpand}
          aria-label="text alignment"
        >
          <ToggleButton value={false} aria-label="collapse">
            <ShortTextIcon />
          </ToggleButton>
          <ToggleButton value={true} aria-label="expand">
            <SubjectIcon />
          </ToggleButton>
        </ToggleButtonGroup>
        <DialogTitle>Siblings</DialogTitle>
      </Toolbar>
      <DialogContent>
        { siblingsTyping.length > 0 &&
          <>
            <Typography variant="h6">
              {siblingsTyping.length} Being Typed
            </Typography>
            <List sx={{ pt: 0 }} dense>
              {siblingsTyping.map((runningConversation) => (
                // TODO: handle user/function/system too? probably not useful, but wouldn't be difficult if needed someday
                <ListItem disableGutters key={runningConversation.id}>
                  <ListItemButton onClick={() => switchToConversation(runningConversation)}>
                    <ListItemAvatar>
                      <AssistantIcon />
                    </ListItemAvatar>
                    <ListItemText
                      primary={getTypingStatus(runningConversation.conversation, 'assistant')}
                      primaryTypographyProps={
                        expand
                        ?
                        {}
                        :
                        {
                          sx: {
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 3,
                            overflow: 'hidden'
                          }
                        }
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        }
        <Typography variant="h6">
          {messages.length} Persisted
        </Typography>
        <List sx={{ pt: 0 }} dense>
          {messages.map((message) => (
            <ListItem disableGutters key={message.hash}>
              <ListItemButton onClick={() => handleListItemClick(message)} sx={{padding: 0}}>
                <ListItemText
                  sx={{padding: 0}}
                  secondary={ emojiSha(message.hash, 5) }
                  primary={message.content}
                  primaryTypographyProps={
                    expand
                    ?
                    {}
                    :
                    {
                      sx: {
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 3,
                        overflow: 'hidden'
                      }
                    }
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}

const MessageBox: React.FC<MessageProps> = ({ message, onPrune, onEdit, openOtherHash, openMessage, isTail, switchToConversation }) => {
  const [openDetails, setOpenDetails] = useState(false);

  const siblings: MessageDB[] = useLiveQuery(() => {
    if (!isMessageDB(message)) {
      return [];
    }

    return db.messages.where('parentHash').equals(message.parentHash ?? "").sortBy('timestamp');
  }, [message], []);

  const incompletePersistence: boolean = useLiveQuery(() => {
    if (!isMessageDB(message)) {
      return false;
    }

    return db.getEmbeddingByHash(message.hash).then(embedding => !embedding);
  }, [message], false);

  const siblingPos = isMessageDB(message) ? siblings.findIndex((sibling) => sibling.hash === message.hash) + 1 : 0;

  const [openSiblings, setOpenSiblings] = useState(false);

  const siblingsTyping = isMessageDB(message) ? Object.values(useTypingWatcher(message, "siblings")).map(({runningConversation}) => runningConversation) : [];

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
            gap: '2px',
          }}
        >
          { isMessageDB(message) && (siblings.length > 0) &&
            <>
              <CornerButton
                onClick={() => setOpenSiblings(true)}
                icon={
                  <>
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
          {isMessageDB(message) && <PruneButton onClick={() => onPrune(message)} />}
          {isMessageDB(message) && <EditButton onClick={() => onEdit(message)} />}
          <CopyButton contentToCopy={message.content} />
          {isMessageDB(message) && <CornerButton onClick={() => setOpenDetails(true)} icon={<InfoIcon fontSize="inherit" />} />}
          {isMessageDB(message) && <EmojiShaButton hash={message.hash} openConversation={() => openMessage(message)} activeLink={!isTail} />}
        </Box>
      </Box>
      { isMessageDB(message) &&
        <>
          <MessageDetails open={openDetails} onClose={() => setOpenDetails(false)} message={message} openOtherHash={openOtherHash} incompletePersistence={incompletePersistence} />
          <SiblingsDialog open={openSiblings} onClose={() => setOpenSiblings(false)} onSelectMessage={openMessage} switchToConversation={switchToConversation} messages={siblings} siblingsTyping={siblingsTyping} />
        </>
      }
    </Box>
  );
};

export default React.memo(MessageBox);
