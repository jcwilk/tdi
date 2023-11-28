import React, { useMemo, useState } from 'react';
import { APIKeyFetcher, APIKeyStorer, isAPIKeySet } from '../../api_key_storage';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Link, TextField, Typography } from '@mui/material';
import { fetchFiles } from '../../openai_api';
import KeyIcon from '@mui/icons-material/Key';
import KeyOffIcon from '@mui/icons-material/KeyOff';

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

  const isStored = useMemo(() => isAPIKeySet(), []);

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

  const handleClear = () => {
    APIKeyStorer('');
    window.location.reload();
  }

  function renderSetter() {
    return (
      <>
        <DialogTitle id="form-dialog-title">Enter API Key</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography>Enter an <Link href="https://platform.openai.com/account/api-keys" color="inherit" target="_blank" rel="noreferrer">OpenAI API Key</Link> to use the generative AI features of this app.</Typography>
            <Typography>If confirmed, the key will be stored only in your browser's local storage. DO NOT do this on a shared or public computer, at least without being in incognito mode.</Typography>
            <Typography>Features enabled by this key include:</Typography>
            <ul>
              <li>AI Chat Assistant (GPT-4 Turbo)</li>
              <li>Voice Entry (Whisper API)</li>
              <li>AI Recursive Summarizer (GPT-4 Turbo)</li>
              <li>Automatic Embeddings</li>
              <li>Pinning and Unpinning Messages (Files API)</li>
              <li>Functions related to the above features</li>
            </ul>
            <Typography>OpenAI API usage will induce minor costs usually on the order of cents for light usage, but imposing a reasonable <Link href="https://platform.openai.com/account/limits" color="inherit" target="_blank" rel="noreferrer">usage limit</Link> on your account can be a good way to be sure things stay within your comfort zone.</Typography>
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
      </>
    )
  }

  function renderClearer() {
    return (
      <>
        <DialogTitle id="form-dialog-title">Clear API Key</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Typography>Are you sure you want to clear your API Key?</Typography>
            <Typography>If you do, you will no longer be able to use the generative AI features of this app.</Typography>
            <Typography>Features disabled by this action include:</Typography>
            <ul>
              <li>AI Chat Assistant (GPT-4 Turbo)</li>
              <li>Voice Entry (Whisper API)</li>
              <li>AI Recursive Summarizer (GPT-4 Turbo)</li>
              <li>Automatic Embeddings</li>
              <li>Pinning and Unpinning Messages (Files API)</li>
              <li>Functions related to the above features</li>
            </ul>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            No, Cancel
          </Button>
          <Button onClick={handleClear} color="primary">
            Yes, Clear
          </Button>
        </DialogActions>
      </>
    )
  };

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClickOpen}
        aria-label="share-conversation"
      >
        {isStored ? <KeyOffIcon /> : <KeyIcon color="error" />}
      </IconButton>
      <Dialog open={open} onClose={handleClose} aria-labelledby="form-dialog-title">
        {isStored ? renderClearer() : renderSetter()}
      </Dialog>
    </>
  );
}
