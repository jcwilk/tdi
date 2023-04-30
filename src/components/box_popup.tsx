import React, { useState, forwardRef, useEffect } from "react";
import Dialog from '@mui/material/Dialog';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import CloseIcon from '@mui/icons-material/Close';
import Slide from '@mui/material/Slide';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import EditNoteIcon from '@mui/icons-material/EditNote';
import MicIcon from '@mui/icons-material/Mic';
import { TransitionProps } from '@mui/material/transitions';
import { getTranscription, getEdit } from "../openai_api";

interface BoxPopupProps {
  openEditor: string;
  onClose: (text: string) => void;
  onSubmit: (text: string) => void;
  onSubmitText: string | null;
  description: string;
  text: string;
  fieldId: string;
  fieldName: string;
}

const Transition = forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

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
    <div>
      <Dialog
        fullScreen
        open={fieldId === openEditor}
        onClose={() => onClose(textValue)}
        TransitionComponent={Transition}
      >
        <AppBar sx={{ position: 'relative' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => onClose(textValue)}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              { description }
            </Typography>
            { onSubmitText &&
              <Button autoFocus color="inherit" onClick={() => onSubmit(textValue)}>
                {onSubmitText}
              </Button>
            }
          </Toolbar>
        </AppBar>
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
      </Dialog>
    </div>
  );
}
