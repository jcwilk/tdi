import React, { FC, useMemo } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton, List, ListItem, ListItemText } from "@mui/material"
import { MessageDB } from '../../chat/conversationDb';
import EmojiShaButton from './emojiShaButton';
import { deserializeFunctionMessageContent, getAllFunctionOptions, invokeDynamicFunctionName, isDynamicFunctionMessageContent, isFunctionMessage } from '../../chat/functionCalling';
import { Conversation } from '../../chat/conversation';
import { ManualFunctionCallButton } from './manualFunctionCall';
import PlayDisabledIcon from '@mui/icons-material/PlayDisabled';

interface MessageDialogProps {
  open: boolean;
  onClose: () => void;
  message: MessageDB;
  openOtherHash: (hash: string) => void;
  conversation: Conversation;
  incompletePersistence: boolean;
  summary: string;
}

const MessageDetails: FC<MessageDialogProps> = ({ open, onClose, message, openOtherHash, conversation, incompletePersistence = false, summary = '' }) => {
  const invokeDynamicFunctionOption = useMemo(() => getAllFunctionOptions().find(func => func.name === invokeDynamicFunctionName), []);

  const date = new Date(message.timestamp);
  const dateString = date.toLocaleDateString();
  const timeString = date.toLocaleTimeString();

  const functionMessageContent = isFunctionMessage(message) && deserializeFunctionMessageContent(message.content)
  const isDynamicFunction = functionMessageContent && isDynamicFunctionMessageContent(functionMessageContent);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Message Details</DialogTitle>
      <DialogContent>
        <List>
          <ListItem secondaryAction={isDynamicFunction && !!invokeDynamicFunctionOption ? (
              <ManualFunctionCallButton
                defaultParameters={{ functionHash: message.hash }}
                functionOption={invokeDynamicFunctionOption}
                conversation={conversation}
                onRun={onClose}
              />
            ) : (
              <IconButton disabled>
                <PlayDisabledIcon />
              </IconButton>
            )}>
            <ListItemText primary="Dynamic Function?" secondary={isDynamicFunction ? "Yes" : "No"} />

          </ListItem>
          <ListItem>
            <ListItemText primary="Sha" secondary={<EmojiShaButton hash={message.hash} openConversation={openOtherHash} />} />
          </ListItem>
          <ListItem>
            <ListItemText primary="Parent Sha" secondary={
              message.parentHash ? <EmojiShaButton hash={message.parentHash} openConversation={openOtherHash} /> : "ROOT"
            } />
          </ListItem>
          <ListItem>
            <ListItemText primary="Has Embedding?" secondary={incompletePersistence ? "No" : "Yes"} />
          </ListItem>
          <ListItem>
            <ListItemText primary="Has Summary Embedding?" secondary={incompletePersistence ? "No" : "Yes"} />
          </ListItem>
          <ListItem>
            <ListItemText primary="Created At" secondary={`${dateString} ${timeString}`} />
          </ListItem>
          <ListItem>
            <ListItemText primary="Summary" secondary={summary} />
          </ListItem>
          <ListItem>
            <ListItemText primary="Content" secondary={message.content} />
          </ListItem>
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MessageDetails;
