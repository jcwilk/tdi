import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Box, Dialog, TextField, Button, AppBar, Toolbar, IconButton, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { sendMessage, typeMessage } from '../../chat/participantSubjects';
import { Conversation } from '../../chat/conversation';
import MessageBox from './messageBox'; // Assuming you've also extracted the MessageBox into its own file.
import { MessageDB } from '../../chat/conversationDb';
import CloseIcon from '@mui/icons-material/Close';
import { emojiSha } from '../../chat/emojiSha';
import { Mic } from '@mui/icons-material';
import { FunctionOption, getTranscription } from '../../openai_api';
import { editConversation, pruneConversation } from '../../chat/messagePersistence';
import BoxPopup from '../box_popup';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import FunctionsIcon from '@mui/icons-material/Functions';
import { FunctionManagement } from './functionManagement';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import SendIcon from '@mui/icons-material/Send';
import MemoryIcon from '@mui/icons-material/Memory';
import { Checkbox } from '@mui/material';
import { getAllFunctionOptions } from '../../chat/functionCalling';

type ConversationModalProps = {
  conversation: Conversation;
  initialGptModel: string;
  onClose: () => void;
  onOpenNewConversation: (leafMessage: MessageDB) => void; // Callback for opening a new conversation on top
  onNewHash: (hash: string) => void;
  onNewModel: (model: string) => void;
  onFunctionsChange: (conversation: Conversation, updatedFunctions: FunctionOption[]) => void;
};

function findIndexByProperty<T>(arr: T[], property: keyof T, value: T[keyof T]): number {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i][property] === value) {
      return i;
    }
  }
  return -1; // Return -1 if no match is found
}

export type ErrorMessage = {
  content: string;
  role: string;
  hash: string;
}

// type guard for ErrorMessage which checks role === 'error'
function isErrorMessage(message: MessageDB | ErrorMessage): message is ErrorMessage {
  return message.role === 'error';
}

function isMessageDB(message: MessageDB | ErrorMessage): message is MessageDB {
  return !isErrorMessage(message);
}

const ConversationModal: React.FC<ConversationModalProps> = ({ conversation, initialGptModel, onClose, onOpenNewConversation, onNewHash, onNewModel, onFunctionsChange }) => {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<(MessageDB | ErrorMessage)[]>([]);
  const [assistantTyping, setAssistantTyping] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stopRecording, setStopRecording] = useState<(() => Promise<string>) | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageDB | null>();
  const [gptModel, setGptModel] = useState<string>(initialGptModel);
  const inputRef = useRef<any>(null);
  const [isFuncMgmtOpen, setFuncMgmtOpen] = useState(false);
  const [selectedFunctions, setSelectedFunctions] = useState<FunctionOption[]>([]);
  const messagesWithoutErrors = useMemo(() => messages.filter(isMessageDB), [messages]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // ugly hack for getting a log when a new modal is created
  useState(() => { console.log("new modal!") });

  const currentLeafHash = messagesWithoutErrors[messagesWithoutErrors.length - 1]?.hash; // no need for useMemo because it's a primitive

  useEffect(() => {
    if (currentLeafHash) {
      console.log("new hash", currentLeafHash)
      onNewHash(currentLeafHash);
    }
  }, [messagesWithoutErrors]);

  useEffect(() => {
    const messageEnd = messagesEndRef.current;
    if (messageEnd && autoScroll) {
      messageEnd.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, assistantTyping, messagesEndRef.current, autoScroll]);

  const { outgoingMessageStream, typingAggregationOutput } = conversation || {};

  useEffect(() => {
    if (!outgoingMessageStream || !typingAggregationOutput) return;

    console.log("establish subs")

    const typingSub = typingAggregationOutput.subscribe((typing: Map<string, string>) => {
      console.log("typingSub", typing)
      setText(typing.get(user.id) || '');
      const messageInProgress = typing.get(assistant.id)
      if (messageInProgress) {
        setAssistantTyping(messageInProgress);
      }
    });

    const msgSub = outgoingMessageStream.subscribe({
      error: (err) => {
        const errorMessage: ErrorMessage = {
          content: err.message,
          role: 'error',
          hash: "fffffffff", // TODO!
        }
        setMessages((previousMessages) => [errorMessage, ...previousMessages]);
      },
      next: (message: MessageDB) => {
        console.log("new message", message)
        setMessages((previousMessages) => [...previousMessages, message]);
        setAssistantTyping('');
      }
    });

    return () => {
      typingSub.unsubscribe();
      msgSub.unsubscribe();
      console.log("TEARDOWN MODAL")
    };
  }, [outgoingMessageStream, typingAggregationOutput]);

  const handleFunctionUpdate = (updatedFunctions: FunctionOption[]) => {
    setMessages([]); // TODO: there's got to be a better way to do this... without this it starts duplicating the conversation
    setSelectedFunctions(updatedFunctions);
    onFunctionsChange(conversation, updatedFunctions);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(user);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      if (stopRecording) {
        const transcript = await stopRecording();
        typeMessage(user, transcript);
        sendMessage(user);
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

  const handlePrune = async (hash: string) => {
    if(messagesWithoutErrors.length === 0) return

    const lastMessage = messagesWithoutErrors[messagesWithoutErrors.length - 1];
    const newLeafMessage = await pruneConversation(lastMessage, [hash]);
    if(newLeafMessage.hash == lastMessage.hash) return;

    onOpenNewConversation(newLeafMessage);
  }

  const handleEdit = async (message: MessageDB, newContent: string) => {
    if(messagesWithoutErrors.length === 0) return;
    const lastMessage = messagesWithoutErrors[messagesWithoutErrors.length - 1];

    const index = findIndexByProperty(messagesWithoutErrors, "hash", message.hash);

    const newLeafMessage = await editConversation(lastMessage, index, {role: message.role, participantId: message.participantId, content: newContent});
    if(newLeafMessage.hash == lastMessage.hash) return;

    onOpenNewConversation(newLeafMessage);
  }

  const user = conversation.participants.find((participant) => participant.role === 'user')!;
  const assistant = conversation.participants.find((participant) => participant.role === 'assistant')!;

  const handleModelChange = (event: React.MouseEvent<HTMLElement>, newModel: string | null) => {
    if (newModel === null) return;

    setMessages([]); // TODO: there's got to be a better way to do this... without this it starts duplicating the conversation
    setGptModel(newModel);
    onNewModel(newModel);
  }

  return (
    // TODO: this thing's fade-in transition makes it really ugly to switch between conversations
    <Dialog fullScreen open onClose={onClose}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          fontFamily: '"Roboto Mono", monospace',
          backgroundColor: '#212121',
          color: '#f5f5f5',
        }}
      >
        <AppBar sx={{ position: 'relative' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => onClose()} // Assuming you have onClose method already
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              {currentLeafHash && emojiSha(currentLeafHash, 5)}
            </Typography>

            <IconButton
              color="inherit"
              onClick={() => setFuncMgmtOpen(true)}
              aria-label="function-management"
            >
              <FunctionsIcon />
            </IconButton>

            <ToggleButtonGroup
              color="primary"
              value={gptModel}
              exclusive
              onChange={handleModelChange} // Assuming you have handleModelChange method
              aria-label="Platform"
            >
              <ToggleButton value="gpt-3.5-turbo"><DirectionsRunIcon /></ToggleButton>
              <ToggleButton value="gpt-4"><DirectionsWalkIcon /></ToggleButton>
            </ToggleButtonGroup>
          </Toolbar>
        </AppBar>

        {isFuncMgmtOpen &&
          <FunctionManagement
            availableFunctions={getAllFunctionOptions()} // Replace with your array of available functions
            selectedFunctions={selectedFunctions} // Replace with your current selected functions
            onUpdate={handleFunctionUpdate}
            onClose={() => setFuncMgmtOpen(false)}
          />
        }

        <Box
          sx={{
            flexGrow: 1,
            overflowY: 'auto',
            display: 'flex',
            padding: '20px',
            flexDirection: 'column',
          }}
        >
          {messages.map((message, index) => (
            <MessageBox
              key={message.hash}
              message={message}
              openConversation={() => isMessageDB(message) && onOpenNewConversation(message)}
              onPrune={() => isMessageDB(message) && handlePrune(message.hash)}
              onEdit={() => isMessageDB(message) && setEditingMessage(message)}
            />
          ))}
          {assistantTyping && (
            <MessageBox key="assistant-typing" message={{ participantId: 'TODO', role: 'assistant', content: assistantTyping }} />
          )}
          <div ref={messagesEndRef} />
        </Box>

        <BoxPopup
          fieldId={editingMessage?.hash ?? "non-id"}
          openEditor={editingMessage?.hash ?? "closed"}
          onClose={() => setEditingMessage(null)}
          onSubmit={async (text) => {
            editingMessage && await handleEdit(editingMessage, text);
            setEditingMessage(null);
          }}
          onSubmitText='Update'
          description="Message"
          text={editingMessage?.content || ""}
          fieldName='Content'
        />

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px',
            alignItems: 'flex-end' // to align the TextField with the bottom of the button
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
            onChange={(e) => typeMessage(user, e.target.value)}
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
                onChange={(event) => setAutoScroll(!autoScroll)}
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
                sendMessage(user);
                inputRef.current.focus();
              }}
              disabled={text === ''}
            >
              <SendIcon />
            </Button>
          </Box>
        </Box>


      </Box>
    </Dialog>
  );
};

export default ConversationModal;
