import React, { useState, forwardRef } from "react";
import Dialog from '@mui/material/Dialog';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CloseIcon from '@mui/icons-material/Close';
import Slide from '@mui/material/Slide';
import { TransitionProps } from '@mui/material/transitions';

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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextValue(e.target.value);
  };

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
        </Box>
      </Dialog>
    </div>
  );
}
