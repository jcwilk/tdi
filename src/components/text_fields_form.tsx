import React, { useState, useEffect } from 'react';
import { StepManager } from '../step_manager';
import StepEditors from './step_editors';
import SavedFunctionsList from './saved_functions_list';
import Button from '@mui/material/Button';

export default function TextFieldsForm() {
  const [stepManager] = useState<StepManager>(new StepManager());
  const [stepDataVersion, setStepDataVersion] = useState<number>(0);
  const [apiKey] = useState<string | null>(localStorage.getItem('apiKey'));
  const [showSavedFunctionsDialog, setShowSavedFunctionsDialog] = useState<boolean>(false);
  const [savedFunctionsUpdateTrigger, setSavedFunctionsUpdateTrigger] = useState<number>(0);

  const handleFunctionSelect = (functionData: any) => {
    // Load the selected function's data into the step manager
    stepManager.loadFunctionData(functionData);
    setShowSavedFunctionsDialog(false);
  };

  const handleClose = () => {
    setShowSavedFunctionsDialog(false);
  };

  const handleOpenSavedFunctionsDialog = () => {
    setShowSavedFunctionsDialog(true);
  };

  useEffect(() => {
    const handleStepDataChanged = () => {
      setStepDataVersion(prevVersion => prevVersion + 1);
    };

    stepManager.on('stepDataChanged', handleStepDataChanged);
    return () => {
      stepManager.off('stepDataChanged', handleStepDataChanged);
    };
  }, [stepManager]);

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
      <StepEditors stepManager={stepManager} apiKey={apiKey} updateTrigger={stepDataVersion} />
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
