import React, { useState } from 'react';
import { Dialog, AppBar, Toolbar, Typography, IconButton, TextField, Box, Button, Alert } from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import CloseIcon from '@mui/icons-material/Close';
import { Message, defaultPausedConversationSettings } from '../../chat/conversation';
import { reprocessMessagesStartingFrom } from '../../chat/messagePersistence';
import { ConversationDB, PersistedMessage } from '../../chat/conversationDb';


function messagesToString(messages: Message[]): string {
  const narrowed = messages.map(({ role, content }) => ({ role, content }));
  return JSON.stringify(narrowed, null, 2);
}

function stringToMessages(text: string): [Message, ...Message[]] {
  const parsed = JSON.parse(text);

  //validate that the parsed object is an array of messages and throw an error if not
  if (!Array.isArray(parsed)) {
    throw new Error('Parsed object is not an array');
  }

  if (parsed.length === 0) {
    throw new Error('Parsed array is empty');
  }

  //validate that each message has a role and content field
  //and map the array to an array of Message objects
  return parsed.map((message, index) => {
    if (!message.role) {
      throw new Error(`Message at index ${index} does not have a role`);
    }
    if (!message.content) {
      throw new Error(`Message at index ${index} does not have a content`);
    }
    return {role: message.role, content: message.content} as Message;
  }) as [Message, ...Message[]];
}
interface JsonEditorDialogProps {
  messages: Message[];
  open: boolean;
  onClose: () => void;
  onNewLeaf: (newLeafMessage: PersistedMessage) => void;
}

const JsonEditorDialog: React.FC<JsonEditorDialogProps> = ({ messages, open, onClose, onNewLeaf }) => {
  const [currentText, setCurrentText] = useState<string>(messagesToString(messages));
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      const updatedMessages = stringToMessages(currentText);
      const newMessages = await reprocessMessagesStartingFrom(new ConversationDB, defaultPausedConversationSettings, updatedMessages);
      const newLeaf = newMessages[newMessages.length - 1].message;
      await onNewLeaf(newLeaf);
      onClose();
    } catch (err) {
      setError(`Failed to convert text to messages: ${err}`);
    }
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentText(event.target.value);
  };

  return (
    <Dialog fullScreen open={open} onClose={onClose}>
      <AppBar sx={{ position: 'relative' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            Edit JSON
          </Typography>
          <Button autoFocus color="inherit" onClick={handleSave}>
            Save
          </Button>
        </Toolbar>
      </AppBar>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ p: 2 }}>
        <TextField
          multiline
          fullWidth
          variant="outlined"
          value={currentText}
          onChange={handleTextChange}
          inputProps={{ style: { fontFamily: 'monospace' } }}
        />
      </Box>
    </Dialog>
  );
};

interface JsonEditorButtonProps {
  messages: Message[];
  onNewLeaf: (newLeafMessage: PersistedMessage) => void;
}

export const JsonEditorButton: React.FC<JsonEditorButtonProps> = ({ messages, onNewLeaf }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        color="inherit"
        onClick={() => setOpen(true)}
        aria-label="json-editor"
      >
        <CodeIcon />
      </IconButton>
      { open && <JsonEditorDialog messages={messages} open={open} onClose={() => setOpen(false)} onNewLeaf={onNewLeaf} />}
    </>
  );
};
