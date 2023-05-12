import React, { useState, useEffect, useRef } from 'react';
import {
  TextField,
  Button,
  Box,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { StepManager } from '../step_manager';
import styles from './css/step_editors.module.css';
import StepEditor from './step_editor';
import OutputEditor from './output_editor';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Masonry from '@mui/lab/Masonry';

interface StepEditorsProps {
  stepManager: StepManager;
}

export default function StepEditors({ stepManager }: StepEditorsProps) {
  const [steps, setSteps] = useState(stepManager.getSteps())
  const [nameFieldValue, setNameFieldValue] = useState(stepManager.getName())
  const [dependentData, setDependentData] = useState(stepManager.getDependentData())
  const [isLoading, setIsLoading] = useState(false)

  const stepManagerRef = useRef(stepManager)

  useEffect(() => {
    stepManagerRef.current = stepManager;

    const callback = () => {
      setSteps(stepManagerRef.current.getSteps())
      setNameFieldValue(stepManagerRef.current.getName())
      setDependentData(stepManagerRef.current.getDependentData())
    };

    stepManager.subscribe(callback);

    return () => {
      stepManagerRef.current.unsubscribe(callback);
    }
  }, [stepManager]);

  const renderNameField = () => (
    <Box sx={{ padding: 2 }}>
      <TextField
        id="name-field"
        label="Name"
        variant="outlined"
        value={nameFieldValue}
        onChange={(event) => {stepManager.setName(event.target.value)}}
        className={styles.nameField}
      />
    </Box>
  );

  const moveItem = (dragId: string, dropId: string) => {
    stepManager.moveStep(dragId, dropId);
  };

  const handleAddStep = () => {
    stepManager.addStep();
  };

  const renderAddStepButton = () => (
    <Box key={"new step"} sx={{ width: '100%', marginBottom: 2 }}>
      <Button
        variant="contained"
        color="primary"
        onClick={handleAddStep}
        startIcon={<AddIcon />}
      >
        Add Step
      </Button>
    </Box>
  );

  const renderSteps = (): JSX.Element[] => {
    const outputElements: JSX.Element[] = [];

    steps.forEach((step, index) => {
      outputElements.push(
        <Box key={step.uuid} sx={{ width: '100%', marginBottom: 2 }}>
          <StepEditor
            step={step}
            onDelete={() => stepManager.deleteAt(index)}
            onDuplicate={() => stepManager.duplicateAt(index)}
            moveItem={moveItem}
            dependentData={dependentData}
            setIsLoading={setIsLoading}
            isLoading={isLoading}
          />
        </Box>
      );
    });

    return outputElements;
  };

  const renderStepOutput = (): JSX.Element[] => {
    const outputElements: JSX.Element[] = [];

    for (const key of Object.keys(dependentData).sort()) {
      const value = dependentData[key];
      outputElements.push(
        <Box key={`field-${key}`} sx={{ width: '100%', marginBottom: 2 }}>
          <OutputEditor
            keyName={key}
            text={value}
            setOutputData={(key: string, value: string) => stepManager.setOutputData(key, value)}
          />
        </Box>
      );
    }

    return outputElements;
  };


  return (
    <div>
      <DndProvider backend={HTML5Backend}>
        <Box>
          <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              {renderNameField()}
            </Box>
          </Box>
          <Masonry columns={{ xs: 1, sm: 2, md: 3, lg: 4 }}>
            {renderSteps()}
            {renderAddStepButton()}
            {renderStepOutput()}
          </Masonry>
        </Box>
      </DndProvider>
    </div>
  );
}
