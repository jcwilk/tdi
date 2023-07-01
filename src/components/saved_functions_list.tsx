import React, { useState, useEffect, forwardRef } from 'react';
import Dialog from '@mui/material/Dialog';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Slide from '@mui/material/Slide';
import Button from '@mui/material/Button';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import CloseIcon from '@mui/icons-material/Close';
import { Box } from '@mui/system';
import { StepManager } from '../step_manager';
import { IndexedDBManager, FunctionData } from '../indexeddb_manager';
import ListItemText from '@mui/material/ListItemText';
import ListItem from '@mui/material/ListItem';
import List from '@mui/material/List';
import Divider from '@mui/material/Divider';
import { TransitionProps } from '@mui/material/transitions';

interface SavedFunctionsListProps {
  stepManager: StepManager;
  onClose: () => void;
  onSelect: (functionData: FunctionData) => void;
}

const Transition = forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function SavedFunctionsList({ stepManager, onClose, onSelect }: SavedFunctionsListProps) {
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

  const handleDelete = async (event: React.MouseEvent, id: number) => {
    event.stopPropagation();
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
    <div>
      <Dialog
        fullScreen
        open
        onClose={onClose}
        TransitionComponent={Transition}
      >
        <AppBar sx={{ position: 'relative' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={onClose}
              aria-label="close"
            >
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              Saved Functions
            </Typography>
            <Button color="inherit" onClick={() => handleSave()}>
              <LibraryAddIcon />
            </Button>
          </Toolbar>
        </AppBar>
        <List>
          {savedFunctions.map((func) => (
            <div key={func.id}>
              <ListItem button onClick={() => handleSelect(func.id)}>
                <ListItemText
                  primary={`${func.name} (${func.stepData.length} steps)`}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button color="inherit" size="small" onClick={(event) => handleDelete(event, func.id)}>
                    <DeleteForeverIcon />
                  </Button>
                </Box>
              </ListItem>
              <Divider />
            </div>
          ))}
        </List>
      </Dialog>
    </div>
  );
}
