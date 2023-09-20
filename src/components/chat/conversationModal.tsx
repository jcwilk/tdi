import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, AppBar, Toolbar, IconButton, Typography, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { Conversation, getAllMessages, getTypingStatus, observeNewMessages, observeTypingUpdates } from '../../chat/conversation';
import MessageBox from './messageBox'; // Assuming you've also extracted the MessageBox into its own file.
import { MessageDB } from '../../chat/conversationDb';
import CloseIcon from '@mui/icons-material/Close';
import { emojiSha } from '../../chat/emojiSha';
import { FunctionOption } from '../../openai_api';
import { editConversation, pruneConversation } from '../../chat/messagePersistence';
import BoxPopup from '../box_popup';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import FunctionsIcon from '@mui/icons-material/Functions';
import { FunctionManagement } from './functionManagement';
import { getAllFunctionOptions } from '../../chat/functionCalling';
import MessageEntry from './messageEntry';

type ConversationModalProps = {
  conversation: Conversation;
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

const ConversationModal: React.FC<ConversationModalProps> = ({ conversation, onClose, onOpenNewConversation, onNewModel, onFunctionsChange }) => {
  const [messages, setMessages] = useState<(MessageDB)[]>(getAllMessages(conversation));
  const [assistantTyping, setAssistantTyping] = useState(getTypingStatus(conversation, "assistant"));
  const [editingMessage, setEditingMessage] = useState<MessageDB | null>();
  const [isFuncMgmtOpen, setFuncMgmtOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const currentLeafHash = messages[messages.length - 1]?.hash; // no need for useMemo because it's a primitive

  useEffect(() => {
    const messageEnd = messagesEndRef.current;
    if (messageEnd && autoScroll) {
      messageEnd.scrollIntoView({ behavior: "instant" });
    }
  }, [messages, assistantTyping, messagesEndRef.current, autoScroll]);

  useEffect(() => {
    console.log("CMCHECK SETUP MODAL")
    const subscriptions = [
      observeTypingUpdates(conversation, "assistant").subscribe(partial => {
        console.log("CMCHECK TYPING UPDATE", partial)
        setAssistantTyping(partial);
      }),
      observeNewMessages(conversation, false).subscribe((message: MessageDB) => {
        console.log("CMCHECK NEW MESSAGE", message)
        setMessages((previousMessages) => [...previousMessages, message]);
      })
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      console.log("CMCHECK TEARDOWN MODAL")
    };
  }, [conversation]);

  const handlePrune = useCallback(async (hash: string) => {
    if(messages.length === 0) return

    const lastMessage = messages[messages.length - 1];
    const newLeafMessage = await pruneConversation(lastMessage, [hash]);
    if(newLeafMessage.hash == lastMessage.hash) return;

    onOpenNewConversation(newLeafMessage.hash);
  }, [messages, onOpenNewConversation, pruneConversation]);

  const handleEdit = async (message: MessageDB, newContent: string) => {
    if(messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];

    const index = findIndexByProperty(messages, "hash", message.hash);

    const newLeafMessage = await editConversation(lastMessage, index, {role: message.role, content: newContent});
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
            openConversation={onOpenNewConversation}
            onPrune={handlePrune}
            onEdit={setEditingMessage}
            openOtherHash={onOpenNewConversation}
          />
        ))}
        {assistantTyping && (
          <MessageBox key="assistant-typing" message={{ role: 'assistant', content: assistantTyping }} />
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
      <MessageEntry
        conversation={conversation}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
      />
    </Box>
  );
};

export default ConversationModal;
