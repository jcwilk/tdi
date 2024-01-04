import React, { useState, useEffect } from "react";
import {
  IconButton,
  TextField,
  Box,
  Chip,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import EditNoteIcon from '@mui/icons-material/EditNote';
import MicIcon from '@mui/icons-material/Mic';
import { getTranscription } from "../openai_api";
import FullScreenPopup from './full_screen_popup';
import { PersistedMessage } from "../chat/conversationDb";
import { ParticipantRole } from "../chat/participantSubjects";
import AssistantIcon from '@mui/icons-material/PrecisionManufacturing';
import UserIcon from '@mui/icons-material/Person';
import SystemIcon from '@mui/icons-material/Dns';
import FunctionIcon from '@mui/icons-material/Functions';
import { isAPIKeySet } from "../api_key_storage";

interface BoxPopupProps {
  openEditor: string;
  onClose: (text: string) => void;
  onSubmitText?: string;
  onSubmit?: (text: string, role: ParticipantRole) => void;
  description: string;
  message: PersistedMessage;
  fieldId: string;
  fieldName: string;
}

export default function BoxPopup({
  fieldId,
  message,
  openEditor,
  onClose,
  onSubmit,
  onSubmitText,
  description,
  fieldName
}: BoxPopupProps) {
  const [textValue, setTextValue] = useState(message.content);
  const [onStopRecordingEdit, setOnStopRecordingEdit] = useState<Function | null>(null);
  const [onStopRecordingRedo, setOnStopRecordingRedo] = useState<Function | null>(null);
  const [role, setRole] = useState<ParticipantRole>(message.role);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextValue(e.target.value);
  };

  // Call this function when the user starts recording
  async function startRecordingRedo() {
    const { getTranscript } = await getTranscription();

    setOnStopRecordingRedo(() => {
      return async () => {
        const transcript = await getTranscript();
        setTextValue(transcript || "");
        setOnStopRecordingRedo(null);
      }
    });
  }

  // Call this function when the user starts recording
  // TODO: replace getEdit with a custom edit conversation
  // async function startRecordingEdit() {
  //   const { finishEdit } = await getEdit(textValue);

  //   setOnStopRecordingEdit(() => {
  //     return async () => {
  //       const transcript = await finishEdit();
  //       setTextValue(transcript || "");
  //       setOnStopRecordingEdit(null);
  //     }
  //   });
  // }

  const handleRoleChange = (
    event: React.MouseEvent<HTMLElement>,
    newRole: ParticipantRole,
  ) => {
    if (newRole !== null) {
      setRole(newRole);
    }
  };

  return (
    <FullScreenPopup
      open={fieldId === openEditor}
      onClose={() => onClose(textValue)}
      title={description}
      submitText={onSubmitText}
      onSubmit={() => onSubmit && onSubmit(textValue, role)}
    >
      <Box sx={{ p: 2 }}>
        <Stack spacing={1}>
          <ToggleButtonGroup
            value={role}
            exclusive
            onChange={handleRoleChange}
            aria-label="text alignment"
          >
            <ToggleButton value="system" aria-label="system">
              <SystemIcon />
            </ToggleButton>
            <ToggleButton value="assistant" aria-label="assistant">
              <AssistantIcon />
            </ToggleButton>
            <ToggleButton value="user" aria-label="user">
              <UserIcon />
            </ToggleButton>
            <ToggleButton value="function" aria-label="function">
              <FunctionIcon />
            </ToggleButton>
          </ToggleButtonGroup>
          { isAPIKeySet() &&
            <Stack direction="row" spacing={1}>
              <Chip
                icon={
                  <MicIcon color={onStopRecordingEdit ? "success" : "disabled"}/>
                }
                label={
                  <IconButton onClick={()=>{
                    // TODO: replace getEdit with a custom edit conversation
                    //onStopRecordingEdit ? onStopRecordingEdit() : startRecordingEdit();
                  }}>
                    <EditNoteIcon color="disabled"/>
                  </IconButton>
                }
              />
              <Chip
                icon={
                  <MicIcon color={onStopRecordingRedo ? "success" : "disabled"}/>
                }
                label={
                  <IconButton onClick={()=>{
                    onStopRecordingRedo ? onStopRecordingRedo() : startRecordingRedo();
                  }}>
                    <RestartAltIcon />
                  </IconButton>
                }
              />
            </Stack>
          }
          <TextField
            multiline
            fullWidth
            value={textValue}
            variant="outlined"
            onChange={handleChange}
            label={fieldName}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </Stack>
      </Box>
    </FullScreenPopup>
  );
}
