import React, { useEffect, useState, useRef } from 'react';
import { Box, TextField, Button, IconButton } from '@mui/material';
import { sendMessage, typeMessage } from '../../chat/participantSubjects';
import { Conversation, observeTypingUpdates } from '../../chat/conversation';
import { Mic } from '@mui/icons-material';
import { getTranscription } from '../../openai_api';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import SendIcon from '@mui/icons-material/Send';
import MemoryIcon from '@mui/icons-material/Memory';
import { Checkbox } from '@mui/material';

type MessageEntryProps = {
  conversation: Conversation;
  autoScroll: boolean;
  onAutoScrollChange: (newValue: boolean) => void;
};

const MessageEntry: React.FC<MessageEntryProps> = ({ conversation, autoScroll, onAutoScrollChange }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stopRecording, setStopRecording] = useState<(() => Promise<string>) | null>(null);
  const inputRef = useRef<any>(null);

  // other state and functions needed for recording, transcribing, etc.

  useEffect(() => {
    const subscription = observeTypingUpdates(conversation, "user").subscribe(setText);
    return () => {
      subscription.unsubscribe();
    };
  }, [conversation]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(conversation, "user", text);
      setText('');
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      if (stopRecording) {
        const transcript = await stopRecording();
        sendMessage(conversation, "user", transcript);
        setText('');
        setStopRecording(null);
        setIsTranscribing(false);
      }
    } else if (!isTranscribing) {
      const { getTranscript } = await getTranscription();

      setStopRecording(() => async () => {
        return await getTranscript();
      });

      setIsRecording(true);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '10px',
        alignItems: 'flex-end', // to align the TextField with the bottom of the button
      }}
    >
      <TextField
        sx={{ flexGrow: 1, marginRight: '10px' }}
        label="Message"
        variant="outlined"
        multiline
        minRows={2}
        maxRows={10}
        value={text}
        onChange={(e) => {
          typeMessage(conversation, "user", e.target.value);
          setText(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
      />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center', // Horizontally center the mic button
          width: 'fit-content' // To ensure the box doesn't take up more width than needed
        }}
      >
        <Box
          sx={{
            height: '48px', // Assuming the height of the mic button is 48px
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '5px'
          }}
        >
          <IconButton
            component={'button'}
            onClick={toggleRecording}
          >
            {isTranscribing ? <MemoryIcon /> : isRecording ? <RecordVoiceOverIcon /> : <Mic />}
          </IconButton>
          <Checkbox
            checked={autoScroll}
            onChange={(event) => onAutoScrollChange(event.target.checked)}
            inputProps={{ 'aria-label': 'Toggle auto scroll' }}
          />
        </Box>
        <Button
          sx={{
            flexGrow: 1, // To allow the Send button to grow
            height: '100%', // Take up the remaining height
          }}
          variant="contained"
          color="primary"
          onClick={() => {
            sendMessage(conversation, "user", text);
            setText('');
            inputRef.current.focus();
          }}
          disabled={text === ''}
        >
          <SendIcon />
        </Button>
      </Box>
    </Box>
  );
};

export default MessageEntry;
