import React, { useMemo, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Button, DialogActions, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Checkbox, IconButton, Switch } from '@mui/material';
import FunctionsIcon from '@mui/icons-material/Functions';
import LockIcon from '@mui/icons-material/Lock';
import { ManualFunctionCallButton } from './manualFunctionCall';
import { FunctionOption } from '../../openai_api';
import { Conversation } from '../../chat/conversation';
import { getAllFunctionOptions } from '../../chat/functionCalling';

interface FunctionManagementProps {
  conversation: Conversation;
  onUpdate: (updatedFunctions: FunctionOption[], lockedFunction: FunctionOption | null) => void;
}

interface FunctionManagementDialogProps {
  conversation: Conversation;
  onUpdate: (updatedFunctions: FunctionOption[], lockedFunction: FunctionOption | null) => void;
  onRun: () => void;
  onClose: () => void;
}

const FunctionManagementDialog: React.FC<FunctionManagementDialogProps> = ({ conversation, onUpdate, onRun, onClose }) => {
  const [selectedFunctions, setSelectedFunctions] = useState<FunctionOption[]>(conversation.functions);
  const [lockedFunction, setLockedFunction] = useState<FunctionOption | null>(conversation.lockedFunction);

  const availableFunctions = useMemo(() => getAllFunctionOptions(), []);

  const handleToggle = (functionName: string) => {
    setSelectedFunctions(prevSelected => {
      const prevIndex = prevSelected.findIndex(func => func.name === functionName);
      const newSelected = [...prevSelected];
      const matching = availableFunctions.find(func => func.name === functionName);

      if (!matching) throw new Error('Function not found: ' + functionName);

      if (prevIndex < 0) {
        newSelected.push(matching);
      }
      else {
        setLockedFunction(prevLocked => {
          if (prevLocked && prevLocked.name === functionName) {
            return null;
          }

          return prevLocked;
        });
        newSelected.splice(prevIndex, 1);
      }

      return newSelected;
    });
  };

  const handleLockToggle = (functionOption: FunctionOption) => {
    setLockedFunction(prevLocked => {
      if (prevLocked && prevLocked.name === functionOption.name) {
        return null;
      }

      setSelectedFunctions(prevSelected => {
        if (prevSelected.find(func => func.name === functionOption.name)) {
          return prevSelected;
        }
        return [...prevSelected, functionOption];
      });
      return functionOption;
    });
  };

  const handleSave = () => {
    onUpdate(selectedFunctions, lockedFunction);
    onClose();
  };

  return (
    <>
      <DialogTitle>Function Management</DialogTitle>
      <DialogContent>
        <List sx={{ width: '100%' }}>
          {availableFunctions.map(func => {
            const labelId = `checkbox-list-label-${func.name}`;

            return (
              <ListItem key={func.name}
              disablePadding>
                <ListItemIcon>
                  <ManualFunctionCallButton functionOption={func} conversation={conversation} onRun={onRun} />
                </ListItemIcon>
                <ListItemText id={labelId} primary={func.name} />
                <IconButton
                  onClick={() => handleLockToggle(func)}
                  edge="end"
                  aria-label={`lock-${func.name}`}
                >
                  <LockIcon color={lockedFunction && lockedFunction.name === func.name ? 'primary' : 'disabled'} />
                </IconButton>
                <Switch
                  edge="end"
                  onChange={() => handleToggle(func.name)}
                  checked={!!selectedFunctions.find(enabledFunc => enabledFunc.name === func.name)}
                  inputProps={{
                    'aria-labelledby': labelId,
                  }}
                />
              </ListItem>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </>
  );
};

export const FunctionManagement: React.FC<FunctionManagementProps> = ({ conversation, onUpdate }) => {
  const [open, setOpen] = useState(false);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleOpen}
        aria-label="function-management"
      >
        <FunctionsIcon />
      </IconButton>
      <Dialog
        open={open}
        onClose={handleClose}
        TransitionProps={{ unmountOnExit: true }}
      >
        <FunctionManagementDialog
          conversation={conversation}
          onUpdate={onUpdate}
          onRun={handleClose}
          onClose={handleClose}
        />
      </Dialog>
    </>
  );
};
