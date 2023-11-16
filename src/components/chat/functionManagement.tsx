import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Checkbox, Button, FormControlLabel, DialogActions, IconButton, FormGroup } from '@mui/material';
import { FunctionOption } from '../../openai_api';
import FunctionsIcon from '@mui/icons-material/Functions';

interface FunctionManagementProps {
  availableFunctions: FunctionOption[];
  selectedFunctions: FunctionOption[];
  onUpdate: (updatedFunctions: FunctionOption[]) => void;
}

export const FunctionManagement: React.FC<FunctionManagementProps> = ({ availableFunctions, selectedFunctions, onUpdate }) => {
  const [currentSelected, setCurrentSelected] = useState<FunctionOption[]>(selectedFunctions);
  const [open, setOpen] = useState(false);

  const handleToggle = (func: FunctionOption) => {
    setCurrentSelected(prevSelected => {
      const isSelected = prevSelected.some(f => f.name === func.name);
      if (isSelected) {
        return prevSelected.filter(f => f.name !== func.name);
      } else {
        return [...prevSelected, func];
      }
    });
  };

  const handleSave = () => {
    onUpdate(currentSelected);
    setOpen(false);
  };

  const handleClose = () => {
    setCurrentSelected(selectedFunctions);
    setOpen(false);
  }

  return (
    <>
      <IconButton
        color="inherit"
        onClick={() => setOpen(true)}
        aria-label="function-management"
      >
        <FunctionsIcon />
      </IconButton>
      <Dialog
        sx={{ '& .MuiDialog-paper': { width: '80%', maxHeight: 435 } }}
        maxWidth="xs"
        open={open}
        onClose={handleClose}
      >
        <DialogTitle>Functions Enabled</DialogTitle>
        <DialogContent dividers>
          <FormGroup>
            {availableFunctions.map(func => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={currentSelected.some(f => f.name === func.name)}
                    onClick={() => handleToggle(func)}
                  />
                }
                label={func.name}
                key={func.name}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button autoFocus onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
