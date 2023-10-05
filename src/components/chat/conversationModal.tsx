import React, { useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { Box, AppBar, Toolbar, IconButton, Typography, ToggleButtonGroup, ToggleButton, Button } from '@mui/material';
import { Conversation, ConversationMode, getAllMessages, getTypingStatus, observeNewMessages, observeTypingUpdates } from '../../chat/conversation';
import MessageBox from './messageBox'; // Assuming you've also extracted the MessageBox into its own file.
import { ConversationDB, MessageDB } from '../../chat/conversationDb';
import CloseIcon from '@mui/icons-material/Close';
import { emojiSha } from '../../chat/emojiSha';
import { FunctionOption } from '../../openai_api';
import BoxPopup from '../box_popup';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import FunctionsIcon from '@mui/icons-material/Functions';
import { FunctionManagement } from './functionManagement';
import { getAllFunctionOptions } from '../../chat/functionCalling';
import MessageEntry from './messageEntry';
import PauseIcon from '@mui/icons-material/Pause';
import MinimizeIcon from '@mui/icons-material/Minimize';
import { useLiveQuery } from 'dexie-react-hooks';
import CornerButton from './cornerButton';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';

type ConversationModalProps = {
  conversation: Conversation;
  onClose: () => void;
  minimize: () => void;
  editMessage: (message: MessageDB, newContent: string) => void; // Callback for editing a message
  pruneMessage: (message: MessageDB) => void; // Callback for pruning a message
  openSha: (leafMessage: string) => void; // Callback for attempting to open a message by sha
  openMessage: (message: MessageDB) => void; // Callback for opening a message in the editor
  onNewModel: (model: ConversationMode) => void;
  onFunctionsChange: (updatedFunctions: FunctionOption[]) => void;
};

const db = new ConversationDB();

const noopF = () => { };

const ConversationModal: React.FC<ConversationModalProps> = ({ conversation, onClose, minimize, editMessage, pruneMessage, openSha, openMessage, onNewModel, onFunctionsChange }) => {
  const [messages, setMessages] = useState<(MessageDB)[]>(getAllMessages(conversation));
  const [assistantTyping, setAssistantTyping] = useState(getTypingStatus(conversation, "assistant"));
  const [editingMessage, setEditingMessage] = useState<MessageDB | null>();
  const [isFuncMgmtOpen, setFuncMgmtOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const currentLeafHash = messages[messages.length - 1]?.hash; // no need for useMemo because it's a primitive

  const availableChild: MessageDB | null | undefined = useLiveQuery(() => {
    const message = messages[messages.length - 1];

    return db.messages.where('parentHash').equals(message.hash).sortBy('timestamp').then(children => children[0] ?? null);
  }, [messages], undefined);

  const availableDescendent: MessageDB | null = useLiveQuery(() => {
    const message = messages[messages.length - 1];

    return db.getLeafMessageFromAncestor(message).then(leaf => leaf.hash === message.hash ? null : leaf);
  }, [messages], null);

  useEffect(() => {
    const messageEnd = messagesEndRef.current;
    if (messageEnd && autoScroll) {
      messageEnd.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, assistantTyping, messagesEndRef.current, autoScroll]);

  useEffect(() => {
    setMessages(getAllMessages(conversation));

    const subscriptions = [
      observeTypingUpdates(conversation, "assistant").subscribe(partial => {
        setAssistantTyping(partial);
      }),
      observeNewMessages(conversation, false).subscribe((message: MessageDB) => {
        setMessages((previousMessages) => [...previousMessages, message]);
      })
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [conversation]);

  const handleModelChange = useCallback((event: React.MouseEvent<HTMLElement>, newModel: ConversationMode | null) => {
    if (newModel === null) return;

    onNewModel(newModel);
  }, [onNewModel]);

  const renderExpander = useCallback((icon: ReactNode, message?: MessageDB, callback?: (message: MessageDB) => void) => {
    const disabled = !callback;

    return (
      <Button
        variant="contained"
        style={{
          borderRadius: '18px',
          backgroundColor: disabled ? '#333' : '#424242', // Darker background color for dark mode
          color: disabled ? '#424242' : '#E0E0E0', // Lighter text color for dark mode
          padding: '4px 8px',
        }}
        onClick={() => callback && message && callback(message)}
        disabled={disabled}
      >
        {icon}
      </Button>
    )
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: 'Poppins, sans-serif',
        backgroundColor: '#212121',
        color: '#f5f5f5',
      }}
    >
      <AppBar sx={{ position: 'relative' }}>
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={onClose}
            aria-label="close"
          >
            <CloseIcon />
          </IconButton>
          <IconButton
            edge="start"
            color="inherit"
            onClick={minimize}
            aria-label="close"
          >
            <MinimizeIcon />
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
            <ToggleButton value="paused"><PauseIcon /></ToggleButton>
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
          flexDirection: 'column',
        }}
      >
        {messages.map((message, index) => (
          <MessageBox
            key={message.hash}
            message={message}
            onPrune={pruneMessage}
            onEdit={setEditingMessage}
            openOtherHash={openSha}
            openMessage={openMessage}
            isTail={index === messages.length - 1}
          />
        ))}
        {assistantTyping && (
          <MessageBox
            key="assistant-typing"
            message={{ role: 'assistant', content: assistantTyping }}
            onPrune={noopF}
            onEdit={noopF}
            openOtherHash={openSha}
            openMessage={noopF}
            isTail={false}
          />
        )}
        <Box
          sx={{
            display: 'flex',
            gap: '5px',
            justifyContent: 'center',
          }}
        >
          {availableChild ?
            renderExpander(<KeyboardArrowDownIcon fontSize="inherit" />, availableChild, openMessage)
            :
            renderExpander(<KeyboardArrowDownIcon fontSize="inherit" />)
          }
          {availableDescendent && availableChild && availableChild.hash !== availableDescendent.hash ?
            renderExpander(<KeyboardDoubleArrowDownIcon fontSize="inherit" />, availableDescendent, openMessage)
            :
            renderExpander(<KeyboardDoubleArrowDownIcon fontSize="inherit" />)
          }
        </Box>
        <div ref={messagesEndRef} />
      </Box>

      <BoxPopup
        fieldId={editingMessage?.hash ?? "non-id"}
        openEditor={editingMessage?.hash ?? "closed"}
        onClose={() => setEditingMessage(null)}
        onSubmit={async (text) => {
          editingMessage && await editMessage(editingMessage, text);
          setEditingMessage(null);
        }}
        onSubmitText='Update'
        description="Message"
        text={editingMessage?.content || ""}
        fieldName='Content'
      />
      <MessageEntry
        conversation={conversation}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
      />
    </Box>
  );
};

export default ConversationModal;
