import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Box, TextField, Button, AppBar, Toolbar, IconButton, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
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
import { ReplaySubject, Subject } from 'rxjs';
import { pluckAll, subscribeUntilFinalized } from '../../chat/rxjsUtilities';

type ConversationModalProps = {
  conversation: Conversation;
  initialGptModel: string;
  onClose: () => void;
  onOpenNewConversation: (leafMessage: string) => void; // Callback for opening a new conversation on top
  onNewModel: (model: string) => void;
  onFunctionsChange: (updatedFunctions: FunctionOption[]) => void;
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

const ConversationModal: React.FC<ConversationModalProps> = ({ conversation, initialGptModel, onClose, onOpenNewConversation, onNewModel, onFunctionsChange }) => {
  const user = conversation.participants.find((participant) => participant.role === 'user')!;
  const assistant = conversation.participants.find((participant) => participant.role === 'assistant')!;

  const [text, setText] = useState(conversation.typingAggregationOutput.getValue().get(user.id) || '');
  const [messages, setMessages] = useState<(MessageDB | ErrorMessage)[]>(pluckAll(conversation.outgoingMessageStream));
  const [assistantTyping, setAssistantTyping] = useState(conversation.typingAggregationOutput.getValue().get(assistant.id) || '');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stopRecording, setStopRecording] = useState<(() => Promise<string>) | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageDB | null>();
  const inputRef = useRef<any>(null);
  const [isFuncMgmtOpen, setFuncMgmtOpen] = useState(false);
  const messagesWithoutErrors = useMemo(() => messages.filter(isMessageDB), [messages]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const currentLeafHash = messagesWithoutErrors[messagesWithoutErrors.length - 1]?.hash; // no need for useMemo because it's a primitive

  useEffect(() => {
    const messageEnd = messagesEndRef.current;
    if (messageEnd && autoScroll) {
      messageEnd.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, assistantTyping, messagesEndRef.current, autoScroll]);

  const { outgoingMessageStream, typingAggregationOutput } = conversation || {};

  useEffect(() => {
    if (!outgoingMessageStream || !typingAggregationOutput) return;

    const typingSub = typingAggregationOutput.subscribe((typing: Map<string, string>) => {
      setText(typing.get(user.id) || '');
      const messageInProgress = typing.get(assistant.id)
      if (messageInProgress) {
        setAssistantTyping(messageInProgress);
      }
    });

    const newMessages = new Subject<MessageDB>();

    const forwarderSubscription = subscribeUntilFinalized(outgoingMessageStream, newMessages);

    const msgSub = newMessages.subscribe({
      error: (err) => {
        const errorMessage: ErrorMessage = {
          content: err.message,
          role: 'error',
          hash: "fffffffff", // TODO!
        }
        setMessages((previousMessages) => [...previousMessages, errorMessage]);
      },
      next: (message: MessageDB) => {
        setMessages((previousMessages) => [...previousMessages, message]);
        setAssistantTyping('');
      }
    });

    return () => {
      typingSub.unsubscribe();
      msgSub.unsubscribe();
      forwarderSubscription.unsubscribe();
      console.log("TEARDOWN MODAL")
    };
  }, [outgoingMessageStream, typingAggregationOutput]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(user, text);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      setIsTranscribing(true);
      if (stopRecording) {
        const transcript = await stopRecording();
        sendMessage(user, transcript);
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

    onOpenNewConversation(newLeafMessage.hash);
  }

  const handleEdit = async (message: MessageDB, newContent: string) => {
    if(messagesWithoutErrors.length === 0) return;
    const lastMessage = messagesWithoutErrors[messagesWithoutErrors.length - 1];

    const index = findIndexByProperty(messagesWithoutErrors, "hash", message.hash);

    const newLeafMessage = await editConversation(lastMessage, index, {role: message.role, participantId: message.participantId, content: newContent});
    if(newLeafMessage.hash == lastMessage.hash) return;

    onOpenNewConversation(newLeafMessage.hash);
  }

  const handleModelChange = useCallback((event: React.MouseEvent<HTMLElement>, newModel: string | null) => {
    if (newModel === null) return;

    onNewModel(newModel);
  }, [onNewModel]);

  return (
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
            value={conversation.model}
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
          selectedFunctions={conversation.functions} // Replace with your current selected functions
          onUpdate={onFunctionsChange}
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
        {messages.map((message) => (
          <MessageBox
            key={message.hash}
            message={message}
            hash={message.hash}
            openConversation={() => isMessageDB(message) && onOpenNewConversation(message.hash)}
            onPrune={() => isMessageDB(message) && handlePrune(message.hash)}
            onEdit={() => isMessageDB(message) && setEditingMessage(message)}
            openOtherHash={(hash: string) => onOpenNewConversation(hash)}
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
              sendMessage(user, text);
              inputRef.current.focus();
            }}
            disabled={text === ''}
          >
            <SendIcon />
          </Button>
        </Box>
      </Box>


    </Box>
  );
};

export default ConversationModal;
