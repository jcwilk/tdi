import React, { ReactNode, useCallback, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, List, ListItem, ListItemAvatar, ListItemButton, ListItemProps, ListItemText, ListItemTextProps, Stack, SxProps, ToggleButton, ToggleButtonGroup, Toolbar, Typography } from '@mui/material';
import { MessageDB } from '../../chat/conversationDb';
import { RunningConversation, SummarizedLeafPath, useLeafMessageTracker, useTypingWatcher } from './useConversationStore';
import { emojiSha } from '../../chat/emojiSha';
import ShortTextIcon from '@mui/icons-material/ShortText';
import SubjectIcon from '@mui/icons-material/Subject';
import { getTypingStatus } from '../../chat/conversation';
import { customizeComponent } from '../../reactUtils';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import SwipeRightAltIcon from '@mui/icons-material/SwipeRightAlt';
import InfoIcon from '@mui/icons-material/Info';
import MessageIcon from '@mui/icons-material/Message';

const ExpandingListItemText = customizeComponent(ListItemText, ({ primary, secondary, expand, displayContent, ...extraProps }) => {
  const sx = expand ? undefined : {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 3,
    overflow: 'hidden'
  }

  return {
    primary: displayContent !== 'secondary' ? primary : undefined,
    secondary: displayContent !== 'primary' ? secondary : undefined,
    ...extraProps,
    primaryTypographyProps: {
      sx
    },
    secondaryTypographyProps: {
      color: displayContent === 'both' ? "text.secondary" : "text.primary",
      sx
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

function ExpandingListItem(props: { primary: ReactNode, secondary?: ReactNode, expand: boolean, displayContent: PrimaryOrSecondary, onClick: () => void } & ListItemProps) {
  const { primary, secondary, expand, displayContent, onClick, ...extraProps } = props;
  return (
    <ListItem disableGutters {...extraProps}>
      <ListItemButton onClick={onClick} sx={{padding: 0}}>
        <ExpandingListItemText
          primary={primary}
          secondary={secondary}
          expand={expand}
          displayContent={displayContent}
        />
      </ListItemButton>
    </ListItem>
    )
}

function ToolbarToggler(props: { title: string, expand: boolean, onToggleExpand: (expand: boolean) => void, displayContent: PrimaryOrSecondary, onToggleDisplayContent: (displayContent: PrimaryOrSecondary) => void }) {
  const { title, expand, onToggleExpand, displayContent, onToggleDisplayContent } = props;

  const handleExpand = (
    _event: React.MouseEvent<HTMLElement>,
    newExpand: boolean | null,
  ) => {
    if (newExpand !== null) {
      onToggleExpand(newExpand);
    }
  };

  const handleChangeDisplay = (
    event: React.MouseEvent<HTMLElement>,
    newDevices: string[],
  ) => {
    console.log(newDevices, displayContent)
    if (newDevices.length > 1) {
      onToggleDisplayContent('both');
    }
    else if (newDevices.length > 0) {
      onToggleDisplayContent(newDevices[0] === 'primary' ? 'primary' : 'secondary');
    }
  };

  const buttonGroupValues = useMemo(() => displayContent === "both" ? ["primary", "secondary"] : [displayContent], [displayContent])

  return (
    <Toolbar>
<Stack direction="row" spacing={4}>

<ToggleButtonGroup
  value={expand}
  exclusive
  onChange={handleExpand}
  aria-label="expand or collapse"
>
  <ToggleButton value={false} aria-label="collapse">
    <ShortTextIcon />
  </ToggleButton>
  <ToggleButton value={true} aria-label="expand">
    <SubjectIcon />
  </ToggleButton>
</ToggleButtonGroup>
<ToggleButtonGroup
  value={buttonGroupValues}
  onChange={handleChangeDisplay}
  aria-label="message or details"
>
  <ToggleButton value="primary" aria-label="message">
    <MessageIcon />
  </ToggleButton>
  <ToggleButton value="secondary" aria-label="details">
    <InfoIcon />
  </ToggleButton>
</ToggleButtonGroup>
</Stack>
        <DialogTitle>{title}</DialogTitle>


    </Toolbar>
  );
}

type PrimaryOrSecondary = "primary" | "secondary" | "both";

function DescendantListItem(props: { path: SummarizedLeafPath, expand: boolean, displayContent: PrimaryOrSecondary, onClick: () => void }) {
  const { path, expand, onClick, displayContent } = props;
  const { message, pathLength, summary } = path;
  const typingConversations = useTypingWatcher(message, "children");
  const secondaryPostfix = Object.keys(typingConversations).length > 0 ? <KeyboardIcon fontSize='inherit' /> : undefined;

  return (
    <ExpandingListItem
      onClick={onClick}
      primary={(displayContent === 'primary' || displayContent === 'both') && message.content}
      secondary={(displayContent === 'secondary' || displayContent === 'both') &&
        <>
          {
            // make pathLength number of SwipeRightAltIcon
            new Array(pathLength).fill(null).map((_, index) => <SwipeRightAltIcon key={index} fontSize='inherit' />)
          }
          &nbsp;
          { emojiSha(message.hash, 5) }
          &nbsp;
          {secondaryPostfix &&
            <>
              &nbsp;
              {secondaryPostfix}
              ...
            </>
          }
          {summary}
        </>
      }
      expand={expand}
      displayContent={displayContent}
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
  const [displayContent, setDisplayContent] = useState<PrimaryOrSecondary>("both");

  const handleListItemClick = useCallback((message: MessageDB) => {
    onSelectMessage(message);
    onClose();
  }, [onClose, onSelectMessage]);

  const messages = useLeafMessageTracker(ancestor);
  console.log("descendants", messages)

  return (
    <Dialog onClose={onClose} open={open}>
      <ToolbarToggler title="Leaf Descendants" expand={expand} onToggleExpand={setExpand} displayContent={displayContent} onToggleDisplayContent={setDisplayContent} />
      <DialogContent>
        <DenseList>
          {messages.map((path) => (
            <DescendantListItem
              key={path.message.hash}
              onClick={() => handleListItemClick(path.message)}
              path={path}
              expand={expand}
              displayContent={displayContent}
            />
          ))}
        </DenseList>
      </DialogContent>
    </Dialog>
  );
}

export type MessageWithSummary = {
  message: MessageDB,
  summary: string | null
}

export function SiblingsDialog(props: {
  onSelectMessage: (message: MessageDB) => void,
  switchToConversation: (RunningConversation: RunningConversation) => void,
  onClose: () => void,
  open: boolean,
  messagesWithSummaries: MessageWithSummary[],
  siblingsTyping: RunningConversation[]
}) {
  const { onClose, open, messagesWithSummaries, onSelectMessage, switchToConversation, siblingsTyping } = props;

  const [expand, setExpand] = useState(false);
  const [displayContent, setDisplayContent] = useState<PrimaryOrSecondary>("both");

  const handleListItemClick = (message: MessageDB) => {
    onSelectMessage(message);
    onClose();
  };

  return (
    <Dialog onClose={onClose} open={open}>
      <ToolbarToggler title="Siblings" expand={expand} onToggleExpand={setExpand} displayContent={displayContent} onToggleDisplayContent={setDisplayContent} />
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
                  displayContent={'primary'}
                />
              ))}
            </DenseList>
          </>
        }
        <Typography variant="h6">
          {messagesWithSummaries.length} Persisted
        </Typography>
        <DenseList>
          {messagesWithSummaries.map(({message, summary}) => (
            <ExpandingListItem
              key={message.hash}
              onClick={() => handleListItemClick(message)}
              primary={message.content}
              secondary={
                <>
                  {emojiSha(message.hash, 5)}
                  {summary}
                </>
              }
              expand={expand}
              displayContent={displayContent}
            />
          ))}
        </DenseList>
      </DialogContent>
    </Dialog>
  );
}
