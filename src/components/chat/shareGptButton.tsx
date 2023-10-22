import React, { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { Message } from '../../chat/conversation';
import ShareIcon from '@mui/icons-material/Share';
import copy from 'copy-to-clipboard';
import { IconButton } from '@mui/material';

type ShareGptMessage = {
  from: 'gpt' | 'human';
  value: string;
}

type ShareGptPayload = {
  avatarUrl: '';
  items: [ShareGptMessage, ...ShareGptMessage[]];
}

type ShareGptResponse = {
  id: string;
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function convertMessage(message: Message): ShareGptMessage {
  const content = escapeHtml(message.content);

  // Annoying... it has special formatting for user vs assistant, so we need
  // to force it to always be assistant so that it renders HTML.
  // if (message.role === 'user') {
  //   return {
  //     from: 'human',
  //     value: content,
  //   };
  // }
  // if (message.role === 'assistant') {
  //   return {
  //     from: 'gpt',
  //     value: content,
  //   };
  // }

  const value = `<strong>${message.role}</strong>\n\n${content}`
  return {
    from: 'gpt',
    value,
  };
}

const ShareGptButton: React.FC<{ messages: [Message, ...Message[]] }> = ({ messages }) => {
  const [open, setOpen] = useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleShare = async () => {
    const payload: ShareGptPayload = {
      avatarUrl: '',
      items: messages.map(convertMessage) as [ShareGptMessage, ...ShareGptMessage[]],
    };
    const response = await fetch('https://sharegpt.com/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const { id } = (await response.json()) as ShareGptResponse;
    copy(`https://shareg.pt/${id}`);
    handleClose();
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClickOpen}
        aria-label="share-conversation"
      >
        <ShareIcon />
      </IconButton>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          {"Share this conversation"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            WARNING: This conversation will be made public via ShareGPT and a link will be copied to your clipboard.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleShare} autoFocus>
            Share
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ShareGptButton;
