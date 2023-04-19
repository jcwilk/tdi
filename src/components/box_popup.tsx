// BoxPopup.tsx
import React, { useEffect, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Slide from '@mui/material/Slide';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import CodeFlask from 'codeflask';

interface BoxPopupProps {
  index: number;
  openEditor: number;
  onClose: () => void;
  stepData: { outputText: string }[];
  stepManager: any;
}

export default function BoxPopup({ index, openEditor, onClose, stepData, stepManager }: BoxPopupProps) {
  const domElementRef = useRef<HTMLDivElement | null>(null);
  const idValue = `code-editor-${index}`;

  return (
    <Dialog
      fullScreen
      open={index === openEditor}
      onClose={onClose}
      TransitionComponent={Slide}
      TransitionProps={{
        onEntered: () => {
          if (index === openEditor) {
            domElementRef.current = document.getElementById(idValue) as HTMLDivElement;
            const flask = new CodeFlask(domElementRef.current, {
              language: "javascript",
              lineNumbers: true,
            });

            flask.updateCode(stepData[openEditor].outputText);
            flask.onUpdate((code) => {
              stepManager.updateStepOutput(index, code);
            });
          }
        },
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
            <Typography variant="h6">X</Typography>
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            Sound
          </Typography>
          <Button autoFocus color="inherit" onClick={onClose}>
            save
          </Button>
        </Toolbar>
      </AppBar>
      <DialogContent>
        <div id={idValue} ref={domElementRef} />
      </DialogContent>
    </Dialog>
  );
}
