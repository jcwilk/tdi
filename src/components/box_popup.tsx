import React, { useState, useEffect } from "react";
import {
  IconButton,
  TextField,
  Box,
  Chip,
  Stack,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import EditNoteIcon from '@mui/icons-material/EditNote';
import MicIcon from '@mui/icons-material/Mic';
import { getTranscription, getEdit } from "../openai_api";
import FullScreenPopup from './full_screen_popup';

interface BoxPopupProps {
  openEditor: string;
  onClose: (text: string) => void;
  onSubmitText?: string;
  onSubmit?: () => void;
  description: string;
  text: string;
  fieldId: string;
  fieldName: string;
}

export default function BoxPopup({
  fieldId,
  text,
  openEditor,
  onClose,
  onSubmit,
  onSubmitText,
  description,
  fieldName
}: BoxPopupProps) {
  const [textValue, setTextValue] = useState(text);
  const [onStopRecordingEdit, setOnStopRecordingEdit] = useState<Function | null>(null);
  const [onStopRecordingRedo, setOnStopRecordingRedo] = useState<Function | null>(null);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextValue(e.target.value);
  };

  useEffect(() => {
    setTextValue(text);
  }, [text]);

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
  async function startRecordingEdit() {
    const { finishEdit } = await getEdit(textValue);

    setOnStopRecordingEdit(() => {
      return async () => {
        const transcript = await finishEdit();
        setTextValue(transcript || "");
        setOnStopRecordingEdit(null);
      }
    });
  }

  return (
    <FullScreenPopup
      open={fieldId === openEditor}
      onClose={() => onClose(textValue)}
      title={description}
      submitText={onSubmitText}
      onSubmit={() => onSubmit(textValue)}
    >
      <Box sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            <Chip
              icon={
                <MicIcon color={onStopRecordingEdit ? "success" : "disabled"}/>
              }
              label={
                <IconButton onClick={()=>{
                  onStopRecordingEdit ? onStopRecordingEdit() : startRecordingEdit();
                }}>
                  <EditNoteIcon />
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
          <TextField
            multiline
            fullWidth
            rows={10}
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
