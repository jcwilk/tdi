import React, { useState } from 'react';
import { APIKeyStorer } from '../../api_key_storage';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Link, TextField, Typography } from '@mui/material';
import { fetchFiles } from '../../openai_api';
import KeyIcon from '@mui/icons-material/Key';
import Badge from '@mui/material/Badge';

async function checkApiKey(apiKey: string): Promise<boolean> {
  try {
    await fetchFiles(apiKey);
  } catch(error) {
    return false;
  }

  return true;
}

export function ApiKeyEntryButton() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setApiKey('');
    setOpen(false);
  };

  const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(event.target.value);
  };

  const handleSubmit = async () => {
    const isValid = await checkApiKey(apiKey);
    if (isValid) {
      APIKeyStorer(apiKey);
      window.location.reload();
    }
    else {
      setError('Invalid API Key');
    }
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClickOpen}
        aria-label="share-conversation"
      >
        <KeyIcon color="error" />
      </IconButton>
      <Dialog open={open} onClose={handleClose} aria-labelledby="form-dialog-title">
        <DialogTitle id="form-dialog-title">Enter API Key</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography>Enter an <Link href="https://platform.openai.com/account/api-keys" color="inherit" target="_blank" rel="noreferrer">OpenAI API Key</Link> to use the generative AI features of this app.</Typography>
            <Typography>If confirmed, the key will be stored only in your browser's local storage.</Typography>
            <Typography>Features enabled by this key include:</Typography>
            <ul>
              <li>AI Chat Assistant (GPT-4 Turbo)</li>
              <li>Voice Entry (Whisper API)</li>
              <li>AI Recursive Summarizer (GPT-4 Turbo)</li>
              <li>Automatic Embeddings</li>
              <li>Pinning and Unpinning Messages (Files API)</li>
              <li>Functions related to the above features</li>
            </ul>
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            fullWidth
            variant="standard"
            id="api-key"
            label="API Key"
            type="password"
            error={error !== ''}
            helperText={error}
            value={apiKey}
            onChange={handleApiKeyChange}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleSubmit} color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
