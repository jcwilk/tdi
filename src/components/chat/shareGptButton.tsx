import React, { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import ShareIcon from '@mui/icons-material/Share';
import copy from 'copy-to-clipboard';
import { IconButton } from '@mui/material';
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import {unified} from 'unified'
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import { possiblyEmbellishedMessageToMarkdown } from '../../chat/functionCalling';
import { ConversationDB, PersistedMessage, PreloadedConversationMessages, PreloadedMessage } from '../../chat/conversationDb';

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

// TODO: will come back to oranizing db access better when there's time
const db = new ConversationDB();

async function convertMessage(message: PreloadedMessage, conversionType: string): Promise<ShareGptMessage> {
  let content = possiblyEmbellishedMessageToMarkdown(db, message);

  if (conversionType === "markdown") {
    content = await markdownToHtmlString(content);
  } else if (conversionType === "escape") {
    content = escapeHtml(content);
  }

  const value = `<strong>${capitalizeFirstLetter(message.role)}</strong>\n\n${content}`
  return {
    from: 'gpt',
    value,
  };
}

const ShareGptButton: React.FC<{ messages: PreloadedConversationMessages }> = ({ messages }) => {
  const [open, setOpen] = useState(false);
  const [conversionType, setConversionType] = useState('markdown');

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleShare = async () => {
    const payload: ShareGptPayload = {
      avatarUrl: '',
      items: (await Promise.all(messages.map(message => convertMessage(message, conversionType)))) as [ShareGptMessage, ...ShareGptMessage[]],
    };
    const response = await fetch('https://sharegpt.com/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const { id } = (await response.json()) as ShareGptResponse;
    const link = `https://shareg.pt/${id}`;

    copy(link);
    window.open(link, '_blank');
  };

  const handleConversionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setConversionType((event.target as HTMLInputElement).value);
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
          Share this conversation
        </DialogTitle>
        <DialogContent>
          <FormControl>
            <FormLabel id="conversion-type">Conversion Type</FormLabel>
            <RadioGroup
              aria-labelledby="conversion-type"
              name="conversion-type"
              value={conversionType}
              onChange={handleConversionChange}
            >
              <FormControlLabel value="markdown" control={<Radio />} label="Convert markdown to HTML (Recommended)" />
              <FormControlLabel value="escape" control={<Radio />} label="Only escape HTML (Markdown syntax won't get parsed)" />
              <FormControlLabel value="none" control={<Radio />} label="Neither (HTML tags may get removed by ShareGPT)" />
            </RadioGroup>
          </FormControl>
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
