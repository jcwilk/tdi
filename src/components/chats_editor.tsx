import React from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  Stack,
  MenuItem,
  Select,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { v4 as uuidv4 } from "uuid";
import { ChatStep, ChatMessage } from "../scenarios";
import BoxPopup from './box_popup';
import styles from './css/step_spec_editor.module.css';

type ChatsEditorProps = {
  chats: { [key: string]: ChatStep };
  onChatsChange: (chats: { [key: string]: ChatStep }) => void;
};

const ChatsEditor: React.FC<ChatsEditorProps> = ({
  chats = {},
  onChatsChange,
}) => {
  const [inputKeys, setInputKeys] = React.useState<{ [key: string]: string }>(
    Object.fromEntries(Object.keys(chats).map((key) => [key, uuidv4()]))
  );
  const [openEditor, setOpenEditor] = React.useState("");

  const handleInputChange = (
    key: string,
    value: string,
    messageIndex: number,
    field: "key" | "role" | "content"
  ) => {
    const newChats = { ...chats };
    if (field === "key") {
      newChats[value] = newChats[key];
      delete newChats[key];

      setInputKeys((prevInputKeys) => {
        const newInputKeys = { ...prevInputKeys };
        newInputKeys[value] = prevInputKeys[key];
        delete newInputKeys[key];
        return newInputKeys;
      });
    } else {
      newChats[key][messageIndex][field] = value;
    }
    onChatsChange(newChats);
  };

  const handleAddKey = () => {
    const newKey = "";
    onChatsChange({ ...chats, [newKey]: [] });
  };

  const handleAddMessage = (key: string) => {
    const newChats = { ...chats };
    newChats[key].push({ role: "user", content: "" });
    onChatsChange(newChats);
  };

  const handleDeleteKey = (key: string) => {
    const newChats = { ...chats };
    delete newChats[key];
    onChatsChange(newChats);
  };

  const handleDeleteMessage = (key: string, messageIndex: number) => {
    const newChats = { ...chats };
    newChats[key].splice(messageIndex, 1);
    onChatsChange(newChats);
  };

  const handleClickOpen = (fieldId: string) => {
    setOpenEditor(fieldId);
  };

  const handleClose = (key: string, chatIndex: number, text: string) => {
    handleInputChange(key, text, chatIndex, "content");
    setOpenEditor("");
  };

  const renderMessage = (
    key: string,
    chatIndex: number,
    message: ChatMessage
  ) => {
    const contentFieldId = `${inputKeys[key] || "blank"}-${chatIndex}-content`;

    return (
      <Stack spacing={1} direction="row" key={`${inputKeys[key]}-${chatIndex}`}>
        <Select
          label="Role"
          value={message.role}
          onChange={(e) =>
            handleInputChange(key, e.target.value, chatIndex, "role")
          }
        >
          <MenuItem value="user">user</MenuItem>
          <MenuItem value="assistant">assistant</MenuItem>
          <MenuItem value="system">system</MenuItem>
        </Select>
        <Box onClick={() => handleClickOpen(contentFieldId)} className={styles.textDisplayBox}>
          {message.content}
        </Box>
        <BoxPopup
          fieldId={contentFieldId}
          openEditor={openEditor}
          onClose={(text: string) => handleClose(key, chatIndex, text)}
          description="Chats"
          text={message.content}
          fieldName={key}
        />
        <IconButton
          onClick={() => handleDeleteMessage(key, chatIndex)}
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Stack>
    );
  };

  const renderChat = (key: string, chat: ChatStep) => {
    return (
      <Stack key={inputKeys[key]} spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label="Key"
            value={key}
            onChange={(e) => handleInputChange(key, e.target.value, 0, "key")}
          />
          <IconButton
            onClick={() => handleDeleteKey(key)}
            color="error"
          >
            <DeleteIcon />
          </IconButton>
          <Button onClick={() => handleAddMessage(key)} startIcon={<AddIcon />}>
            Add Message
          </Button>
        </Stack>
        {chat.map((message, chatIndex) =>
          renderMessage(key, chatIndex, message)
        )}
      </Stack>
    );
  };

  return (
    <>
      <Typography variant="h6">Chats</Typography>
      {chats &&
        Object.entries(chats).map(([key, chat]) => (
          renderChat(key, chat)
        ))}
      <Stack direction="row" spacing={1}>
        <Button onClick={handleAddKey} startIcon={<AddIcon />}>
          Add Chat
        </Button>
      </Stack>
    </>
  );
};

export default ChatsEditor;
