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
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import {unified} from 'unified'

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

async function markdownToHtmlString(markdown: string): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(rehypeStringify)
      .process(markdown)
  );
}

// An alternative approach - this works better for non-markdown content
// Ideally, we'd automatically figure out what the best way to represent
// the message is, but that's substantially more work than I want to put
// into the share feature at this time.
function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function capitalizeFirstLetter(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

async function convertMessage(message: Message): Promise<ShareGptMessage> {
  const content = message.content;

  // Annoying... it has special formatting for user vs assistant, so we need
  // to force it to always be assistant so that it renders HTML.
  const value = `<strong>${capitalizeFirstLetter(message.role)}</strong>\n\n${await markdownToHtmlString(content)}`
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
      items: (await Promise.all(messages.map(convertMessage))) as [ShareGptMessage, ...ShareGptMessage[]],
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
