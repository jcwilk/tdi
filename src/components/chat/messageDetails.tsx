import React, { FC } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material"
import { MessageDB } from '../../chat/conversationDb';
import { styled } from '@mui/system';
import EmojiShaButton from './emojiShaButton';

const TruncateText = styled('p')({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

interface MessageDialogProps {
  open: boolean;
  onClose: () => void;
  message: MessageDB;
  openOtherHash: (hash: string) => void;
  incompletePersistence: boolean;
}

const MessageDetails: FC<MessageDialogProps> = ({ open, onClose, message, openOtherHash, incompletePersistence = false }) => {
  const date = new Date(message.timestamp);
  const dateString = date.toLocaleDateString();
  const timeString = date.toLocaleTimeString();

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Message Details</DialogTitle>
      <DialogContent>
        {/* <p>Summary: {message.summary}</p> */}
        <p>Sha: {<EmojiShaButton hash={message.hash} openConversation={openOtherHash} />}</p>
        <TruncateText>Content Preview: {message.content}</TruncateText>
        <p>Has Embedding: { incompletePersistence ? "No" : "Yes" }</p>
        <p>Created At: {dateString} {timeString}</p>
        <p>Parent Sha: {message.parentHash ? <EmojiShaButton hash={message.parentHash} openConversation={openOtherHash} /> : "ROOT"}</p>
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
