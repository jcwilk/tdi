import React, { useState, useEffect } from 'react';
import { StepManager } from '../step_manager';
import {
  Dialog,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  TextField,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Slide from '@mui/material/Slide';
import { TransitionProps } from '@mui/material/transitions';
import { forwardRef } from 'react';

interface EditSpecificationsCodeProps {
  stepManager: StepManager;
  onClose: () => void;
}

const Transition = forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function EditSpecificationsCode({ stepManager, onClose }: EditSpecificationsCodeProps) {
  const [codeText, setCodeText] = useState<string>('');

  useEffect(() => {
    const saveData = stepManager.getSaveData();
    setCodeText(JSON.stringify(saveData, null, 2));
  }, [stepManager]);

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newText = event.target.value;
    setCodeText(newText);

    try {
      const jsonData = JSON.parse(newText);
      stepManager.setSaveData(jsonData);
    } catch (err) {
      // Do nothing when the JSON is invalid
    }
  };

  return (
    <div>
      <Dialog fullScreen open onClose={onClose} TransitionComponent={Transition}>
        <AppBar sx={{ position: 'relative' }}>
          <Toolbar>
            <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              Edit Specifications Code
            </Typography>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 2 }}>
          <TextField
            multiline
            fullWidth
            variant="outlined"
            value={codeText}
            onChange={handleCodeChange}
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
        </Box>
      </Dialog>
    </div>
  );
}
