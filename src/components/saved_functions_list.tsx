import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { Box } from '@mui/system';
import { IndexedDBManager } from '../indexeddb_manager';

export default function SavedFunctionsList({ updateTrigger, onClose, onSelect }: { onClose: () => void; onSelect: (functionData: any) => void }) {
  const [savedFunctions, setSavedFunctions] = useState<any[]>([]);
  const indexedDBManager = new IndexedDBManager('FunctionsDB', 'functions');

  useEffect(() => {
    fetchSavedFunctions();
  }, [updateTrigger]);

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

  return (
    <>
      <Dialog open onClose={onClose}>
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
