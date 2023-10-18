import React, { ReactNode, useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, List, ListItem, ListItemAvatar, ListItemButton, ListItemProps, ListItemText, SxProps, ToggleButton, ToggleButtonGroup, Toolbar, Typography } from '@mui/material';
import { LeafPath, MessageDB } from '../../chat/conversationDb';
import { RunningConversation, useLeafMessageTracker, useTypingWatcher } from './useConversationStore';
import { emojiSha } from '../../chat/emojiSha';
import ShortTextIcon from '@mui/icons-material/ShortText';
import SubjectIcon from '@mui/icons-material/Subject';
import { getTypingStatus } from '../../chat/conversation';
import { customizeComponent } from '../../reactUtils';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import SwipeRightAltIcon from '@mui/icons-material/SwipeRightAlt';

const ExpandingListItemText = customizeComponent(ListItemText, ({ primary, secondary, expand, ...extraProps }) => {
  return {
    primary,
    secondary,
    ...extraProps,
    primaryTypographyProps: expand
      ? undefined
      : {
          sx: {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
            overflow: 'hidden'
          }
        }
  };
});

const DenseList = customizeComponent(List, ({ ...extraProps }) => {
  return {
    ...extraProps,
    dense: true,
    sx: {
      pt: 0,
      ...extraProps.sx
    }
  };
});


function ExpandingListItem(props: { primary: ReactNode, secondary?: ReactNode, expand: boolean, onClick: () => void } & ListItemProps) {
  const { primary, secondary, expand, onClick, ...extraProps } = props;
  return (
    <ListItem disableGutters {...extraProps}>
      <ListItemButton onClick={onClick} sx={{padding: 0}}>
        <ExpandingListItemText
          primary={primary}
          secondary={secondary}
          expand={expand}
        />
      </ListItemButton>
    </ListItem>
    )
}

function ToolbarToggler(props: { title: string, expand: boolean, onToggleExpand: (expand: boolean) => void }) {
  const { title, expand, onToggleExpand } = props;

  const handleExpand = (
    _event: React.MouseEvent<HTMLElement>,
    newExpand: boolean | null,
  ) => {
    if (newExpand !== null) {
      onToggleExpand(newExpand);
    }
  };

  return (
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
      <DialogTitle>{title}</DialogTitle>
    </Toolbar>
  );
}

function DescendantListItem(props: { path: LeafPath, expand: boolean, onClick: () => void }) {
  const { path, expand, onClick } = props;
  const { message, pathLength } = path;
  const typingConversations = useTypingWatcher(message, "children");
  const secondaryPrefix = Object.keys(typingConversations).length > 0 ? <KeyboardIcon fontSize='inherit' /> : undefined;

  return (
    <ExpandingListItem
      onClick={onClick}
      primary={message.content}
      secondary={
        <>
          {
            // make pathLength number of SwipeRightAltIcon
            new Array(pathLength).fill(<SwipeRightAltIcon fontSize='inherit' />)
          }
          &nbsp;
          { emojiSha(message.hash, 5) }
          &nbsp;
          {secondaryPrefix &&
            <>
              &nbsp;
              {secondaryPrefix}
              ...
            </>
          }
        </>
      }
      expand={expand}
    />
  );
}

export function LeafDescendantsDialog(props: {
  onSelectMessage: (message: MessageDB) => void,
  onClose: () => void,
  open: boolean,
  ancestor: MessageDB
}) {
  const { onClose, open, ancestor, onSelectMessage } = props;

  const [expand, setExpand] = useState(false);

  const handleListItemClick = useCallback((message: MessageDB) => {
    onSelectMessage(message);
    onClose();
  }, [onClose, onSelectMessage]);

  const messages = useLeafMessageTracker(ancestor);

  return (
    <Dialog onClose={onClose} open={open}>
      <ToolbarToggler title="Leaf Descendants" expand={expand} onToggleExpand={setExpand} />
      <DialogContent>
        <DenseList>
          {messages.map((path) => (
            <DescendantListItem
              key={path.message.hash}
              onClick={() => handleListItemClick(path.message)}
              path={path}
              expand={expand}
            />
          ))}
        </DenseList>
      </DialogContent>
    </Dialog>
  );
}

export function SiblingsDialog(props: {
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

  return (
    <Dialog onClose={onClose} open={open}>
      <ToolbarToggler title="Siblings" expand={expand} onToggleExpand={setExpand} />
      <DialogContent>
        { siblingsTyping.length > 0 &&
          <>
            <Typography variant="h6">
              {siblingsTyping.length} Being Typed
            </Typography>
            <DenseList>
              {siblingsTyping.map((runningConversation) => (
                // TODO: display user/function/system too? probably not useful, but wouldn't be difficult if needed someday
                <ExpandingListItem
                  key={runningConversation.id}
                  onClick={() => switchToConversation(runningConversation)}
                  primary={getTypingStatus(runningConversation.conversation, "assistant")}
                  expand={expand}
                />
              ))}
            </DenseList>
          </>
        }
        <Typography variant="h6">
          {messages.length} Persisted
        </Typography>
        <DenseList>
          {messages.map((message) => (
            <ExpandingListItem
              key={message.hash}
              onClick={() => handleListItemClick(message)}
              primary={message.content}
              secondary={emojiSha(message.hash, 5)}
              expand={expand}
            />
          ))}
        </DenseList>
      </DialogContent>
    </Dialog>
  );
}
