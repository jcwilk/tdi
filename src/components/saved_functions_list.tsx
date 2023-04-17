import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { Box } from '@mui/system';
import { StepManager } from '../step_manager';
import { IndexedDBManager, FunctionData } from '../indexeddb_manager';

interface SavedFunctionsListProps {
  stepManager: StepManager;
  updateTrigger: number;
  onClose: () => void;
  onSelect: (functionData: FunctionData) => void;
}

export default function SavedFunctionsList({ stepManager, updateTrigger, onClose, onSelect }: SavedFunctionsListProps) {
  const [savedFunctions, setSavedFunctions] = useState<FunctionData[]>([]);
  const indexedDBManager = new IndexedDBManager('FunctionsDB', 'functions');

  useEffect(() => {
    fetchSavedFunctions();
  }, []);

  const fetchSavedFunctions = async () => {
    const functions = await indexedDBManager.getAllFunctionData();
    setSavedFunctions(functions);
  };

  const handleSelect = async (id: number) => {
    const functionData = await indexedDBManager.getFunctionDataById(id);
    onSelect(functionData);
    onClose();
  };

  const handleDelete = async (id: number) => {
    await indexedDBManager.deleteFunctionDataById(id);
    fetchSavedFunctions();
  };

  const handleSave = async () => {
    const functionData = stepManager.getSaveData();
    const existingFunction = savedFunctions.find((func) => func.name === functionData.name);

    if (existingFunction) {
      const confirmOverwrite = window.confirm(
        `A function with the name "${functionData.name}" already exists. Do you want to overwrite it?`
      );

      if (confirmOverwrite) {
        await indexedDBManager.updateFunctionDataById(existingFunction.id, functionData);
        fetchSavedFunctions();
      }
    } else {
      await indexedDBManager.saveFunctionData(functionData);
      fetchSavedFunctions();
    }
  };

  return (
    <>
      <Dialog open onClose={onClose}>
        <Button size="small" onClick={() => handleSave()}>
          +Save current
        </Button>
        <DialogTitle>Saved Functions</DialogTitle>
        <DialogContent>
          {savedFunctions.map((func) => (
            <Box key={func.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
              <Box>
                <strong>{func.name}</strong> ({func.stepData.length} steps)
              </Box>
              <Box>
                <Button size="small" onClick={() => handleSelect(func.id)}>
                  Load
                </Button>
                <Button size="small" onClick={() => handleDelete(func.id)}>
                  Delete
                </Button>
              </Box>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
