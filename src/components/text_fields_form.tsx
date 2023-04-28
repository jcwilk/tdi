import React, { useState, useEffect } from 'react';
import { StepManager } from '../step_manager';
import StepEditors from './step_editors';
import SavedFunctionsList from './saved_functions_list';
import Button from '@mui/material/Button';
import ApiKeyEntry from './api_key_entry';
import { BasicTDISteps } from '../scenarios';

export default function TextFieldsForm() {
  const [stepManager, setStepManager] = useState<StepManager | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('apiKey'));
  const [showSavedFunctionsDialog, setShowSavedFunctionsDialog] = useState<boolean>(false);
  const [savedFunctionsUpdateTrigger, setSavedFunctionsUpdateTrigger] = useState<number>(0);

  const loadStepManager = () => {
    if (apiKey === null) return;

    const stepManager = new StepManager(apiKey, BasicTDISteps);
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

  const handleApiKeySubmit = (key: string) => {
    localStorage.setItem('apiKey', key);
    setApiKey(key);
  };

  const handleOpenSavedFunctionsDialog = () => {
    setShowSavedFunctionsDialog(true);
  };

  if (stepManager === null || apiKey === null) {
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
        Saved Functions
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
