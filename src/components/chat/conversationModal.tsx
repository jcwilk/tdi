import React, { useEffect, useState, useRef, useCallback, ReactNode, useMemo } from 'react';
import { Box, AppBar, Toolbar, IconButton, ToggleButtonGroup, ToggleButton, Button } from '@mui/material';
import { Conversation, ConversationMode, getAllMessages, getTypingStatus, observeNewMessages, observeTypingUpdates } from '../../chat/conversation';
import MessageBox from './messageBox'; // Assuming you've also extracted the MessageBox into its own file.
import { ConversationDB, ConversationMessages, PersistedMessage, PreloadedConversationMessages, PreloadedMessage } from '../../chat/conversationDb';
import CloseIcon from '@mui/icons-material/Close';
import { FunctionOption } from '../../openai_api';
import BoxPopup from '../box_popup';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import { FunctionManagement } from './functionManagement';
import MessageEntry from './messageEntry';
import PauseIcon from '@mui/icons-material/Pause';
import MinimizeIcon from '@mui/icons-material/Minimize';
import { useLiveQuery } from 'dexie-react-hooks';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';
import { ParticipantRole } from '../../chat/participantSubjects';
import { RunningConversation } from './useConversationStore';
import { LeafDescendantsDialog } from './messageBoxDialogs';
import { concatMap, defaultIfEmpty, filter, firstValueFrom, map } from 'rxjs';
import ShareGptButton from './shareGptButton';
import { JsonEditorButton } from './jsonEditorButton';
import { isAPIKeySet } from '../../api_key_storage';
import { ApiKeyEntryButton } from './apiKeyEntryButton';

type ConversationModalProps = {
  db: ConversationDB;
  runningConversation: RunningConversation;
  onClose: () => void;
  minimize: () => void;
  editMessage: (message: PersistedMessage, newContent: string, newRole: ParticipantRole) => void; // Callback for editing a message
  pruneMessage: (message: PersistedMessage) => void; // Callback for pruning a message
  openSha: (leafMessage: string) => void; // Callback for attempting to open a message by sha
  openMessage: (message: PersistedMessage) => void; // Callback for opening a message in the editor
  onNewModel: (model: ConversationMode) => void;
  onFunctionsChange: (updatedFunctions: FunctionOption[], lockedFunction: FunctionOption | null) => void;
  switchToConversation: (runningConversation: RunningConversation) => void;
};

const noopF = () => { };

const ConversationModal: React.FC<ConversationModalProps> = ({ db, runningConversation, onClose, minimize, editMessage, pruneMessage, openSha, openMessage, onNewModel, onFunctionsChange, switchToConversation }) => {
  const { conversation } = runningConversation;

  const [messages, setMessages] = useState<PreloadedConversationMessages>(getAllMessages(conversation));
  const [assistantTyping, setAssistantTyping] = useState(getTypingStatus(conversation, "assistant"));
  const [editingMessage, setEditingMessage] = useState<PersistedMessage | null>();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [openDescendants, setOpenDescendants] = useState<boolean>(false);

  const currentLeafMessage = useMemo(() => {
    return messages[messages.length - 1];
  }, [messages]);

  const availableChild: PersistedMessage | null | undefined = useLiveQuery(async () => {
    const message = messages[messages.length - 1];

    return (await db.getDirectChildren(message))[0] ?? null;
  }, [messages], undefined);

  const availableIndirectDescendent = useLiveQuery(async () => {
    const indirectDescendents = db.getLeafMessagesFrom(currentLeafMessage).pipe(
      // filter out the current leaf and its direct children
      filter(({pathLength}) => pathLength > 1),
      map(({message}) => message),

      // we want the promise to get a value either way so it doesn't fail, null works
      defaultIfEmpty(null)
    );
    return !!(await firstValueFrom(indirectDescendents));
  }, [currentLeafMessage], undefined);

  useEffect(() => {
    const messageEnd = messagesEndRef.current;
    if (messageEnd && autoScroll) {
      messageEnd.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, assistantTyping, messagesEndRef.current, autoScroll]);

  useEffect(() => {
    const subscriptions = [
      observeTypingUpdates(conversation, "assistant").subscribe(partial => {
        setAssistantTyping(partial);
      }),
      observeNewMessages(conversation, false).pipe(
        concatMap(message => db.preloadMessage(message))
      ).subscribe((message: PreloadedMessage) => {
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

  const handleOpenAvailableChild = useMemo(() => {
    if (!availableChild) return null;

    return () => openMessage(availableChild);
  }, [availableChild, openMessage]);

  const handleOpenDescendants = useMemo(() => {
    if (!availableIndirectDescendent) return null;

    return () => setOpenDescendants(true);
  }, [availableIndirectDescendent]);

  const renderExpander = useCallback((icon: ReactNode, callback: null | (() => void)) => {
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
        onClick={() => callback && callback()}
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
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', overflow: 'auto' }}>
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
          </Box>
          <Box sx={{ display: 'flex', overflow: 'auto' }}>
            <ApiKeyEntryButton />
            <ShareGptButton messages={messages} />
            <JsonEditorButton messages={messages} onNewLeaf={openMessage} />
            <FunctionManagement
              conversation={conversation}
              onUpdate={onFunctionsChange}
            />
            { isAPIKeySet() &&
              <ToggleButtonGroup
                color="primary"
                value={conversation.settings.model}
                exclusive
                onChange={handleModelChange} // Assuming you have handleModelChange method
                aria-label="Platform"
              >
                <ToggleButton value="paused"><PauseIcon /></ToggleButton>
                <ToggleButton value="gpt-4"><DirectionsRunIcon /></ToggleButton>
              </ToggleButtonGroup>
            }
          </Box>
        </Toolbar>
      </AppBar>

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
            db={db}
            message={message}
            conversation={conversation}
            onPrune={pruneMessage}
            onEdit={setEditingMessage}
            openOtherHash={openSha}
            openMessage={openMessage}
            isTail={index === messages.length - 1 && !assistantTyping}
            switchToConversation={switchToConversation}
          />
        ))}
        {assistantTyping && (
          <MessageBox
            key="assistant-typing"
            db={db}
            message={{ role: 'assistant', content: assistantTyping }}
            conversation={conversation}
            onPrune={noopF}
            onEdit={noopF}
            openOtherHash={openSha}
            openMessage={noopF}
            isTail={false}
            switchToConversation={noopF}
          />
        )}
        <Box
          sx={{
            display: 'flex',
            gap: '5px',
            justifyContent: 'center',
          }}
        >
          {renderExpander(<KeyboardArrowDownIcon fontSize="inherit" />, handleOpenAvailableChild)}
          {renderExpander(<KeyboardDoubleArrowDownIcon fontSize="inherit" />, handleOpenDescendants)}
        </Box>
        <div ref={messagesEndRef} />
      </Box>

      { editingMessage &&
        <BoxPopup
          fieldId={editingMessage?.hash ?? "non-id"}
          openEditor={editingMessage?.hash ?? "closed"}
          onClose={() => setEditingMessage(null)}
          onSubmit={async (text, role) => {
            editingMessage && await editMessage(editingMessage, text, role);
            setEditingMessage(null);
          }}
          onSubmitText='Update'
          description="Message"
          message={editingMessage}
          fieldName='Content'
        />
      }
      <LeafDescendantsDialog
        open={openDescendants}
        onClose={() => setOpenDescendants(false)}
        onSelectMessage={openMessage}
        ancestor={currentLeafMessage}
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
