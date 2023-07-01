import React, { useState, useEffect } from 'react';
import { StepManager } from '../step_manager';
import StepEditors from './step_editors';
import SavedFunctionsList from './saved_functions_list';
import EditSpecificationsCode from './edit_specifications_code'; // Import the new component
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import ApiKeyEntry from './api_key_entry';
import { BasicTDISteps } from '../scenarios';
import FolderIcon from '@mui/icons-material/Folder';
import CodeIcon from '@mui/icons-material/Code'; // Import the CodeIcon for the new button
import { APIKeyFetcher } from '../api_key_storage';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Client from './chat/client'
import ChatIcon from '@mui/icons-material/Chat';

export default function TextFieldsForm() {
  const [stepManager, setStepManager] = useState<StepManager | null>(null);
  const [apiKey, setApiKey] = useState<boolean>(!!APIKeyFetcher());
  const [showSavedFunctionsDialog, setShowSavedFunctionsDialog] = useState<boolean>(false);
  const [showEditSpecificationsCodeDialog, setShowEditSpecificationsCodeDialog] = useState<boolean>(false); // New state for the new dialog
  const [currentlyChatting, setCurrentlyChatting] = useState<boolean>(false); // TODO: set based on query param

  const loadStepManager = () => {
    if (apiKey === null) return;

    const stepManager = new StepManager(BasicTDISteps);
    setStepManager(stepManager);
  };

  useEffect(loadStepManager, [apiKey]);

  const handleFunctionSelect = (functionData: any) => {
    if(stepManager) stepManager.setSaveData(functionData);
    setShowSavedFunctionsDialog(false);
  };

  const handleClose = () => {
    setShowSavedFunctionsDialog(false);
  };

  const handleApiKeySubmit = () => {
    setApiKey(true);
  };

  const handleSwitchToFromChat = () => {
    setCurrentlyChatting(!currentlyChatting);
  }

  const handleOpenSavedFunctionsDialog = () => {
    setShowSavedFunctionsDialog(true);
  };

  const handleOpenEditSpecificationsCodeDialog = () => {
    setShowEditSpecificationsCodeDialog(true);
  };

  const handleCloseEditSpecificationsCodeDialog = () => {
    setShowEditSpecificationsCodeDialog(false);
  };

  if (stepManager === null || !apiKey) {
    return <ApiKeyEntry onSubmit={handleApiKeySubmit} />;
  }

  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#1976d2',
      },
    },
  });

  return (
    <div id="text-input-form">
      <ThemeProvider theme={darkTheme}>
        <Box
          sx={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            display: 'flex',
            flexDirection: 'row',
            gap: '8px',
          }}
        >

          <Button variant="contained" onClick={handleSwitchToFromChat}>
            <ChatIcon />
          </Button>
          <Button variant="contained" onClick={handleOpenEditSpecificationsCodeDialog}>
            <CodeIcon />
          </Button>
          <Button variant="contained" onClick={handleOpenSavedFunctionsDialog}>
            <FolderIcon />
          </Button>
        </Box>
        {currentlyChatting &&
          <Client/>
        }
        {!currentlyChatting &&
          <StepEditors stepManager={stepManager} />
        }
        {showEditSpecificationsCodeDialog && (
          <EditSpecificationsCode
            stepManager={stepManager}
            onClose={handleCloseEditSpecificationsCodeDialog}
          />
        )}
        {showSavedFunctionsDialog && (
          <SavedFunctionsList
            stepManager={stepManager}
            onClose={handleClose}
            onSelect={handleFunctionSelect}
          />
        )}
      </ThemeProvider>
    </div>
  );
}
