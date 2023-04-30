import React, { useState, useEffect } from 'react';
import { StepManager } from '../step_manager';
import StepEditors from './step_editors';
import SavedFunctionsList from './saved_functions_list';
import Button from '@mui/material/Button';
import ApiKeyEntry from './api_key_entry';
import { BasicTDISteps } from '../scenarios';
import FolderIcon from '@mui/icons-material/Folder';
import { APIKeyFetcher } from '../api_key_storage';

export default function TextFieldsForm() {
  const [stepManager, setStepManager] = useState<StepManager | null>(null);
  const [apiKey, setApiKey] = useState<boolean>(!!APIKeyFetcher());
  const [showSavedFunctionsDialog, setShowSavedFunctionsDialog] = useState<boolean>(false);
  const [savedFunctionsUpdateTrigger, setSavedFunctionsUpdateTrigger] = useState<number>(0);

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

  const handleOpenSavedFunctionsDialog = () => {
    setShowSavedFunctionsDialog(true);
  };

  if (stepManager === null || !apiKey) {
    return <ApiKeyEntry onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div id="text-input-form">
      <Button
        variant="contained"
        onClick={handleOpenSavedFunctionsDialog}
        sx={{
          position: 'absolute',
          top: '16px',
          right: '16px',
        }}
      >
        <FolderIcon />
      </Button>
      <StepEditors stepManager={stepManager} />
      {showSavedFunctionsDialog && (
        <SavedFunctionsList
          stepManager={stepManager}
          updateTrigger={savedFunctionsUpdateTrigger}
          onClose={handleClose}
          onSelect={handleFunctionSelect}
        />
      )}
    </div>
  );
}
