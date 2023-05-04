import React, { useState, useEffect } from 'react';
import {
  Grid,
  TextField,
  Button,
  Box,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { StepManager } from '../step_manager';
import styles from './css/step_editors.module.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import StepEditor from './step_editor';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface StepEditorsProps {
  stepManager: StepManager;
}

export default function StepEditors({ stepManager }: StepEditorsProps) {
  const [steps, setSteps] = useState(stepManager.getSteps())
  const [nameFieldValue, setNameFieldValue] = useState(stepManager.getName())

  useEffect(() => {
    const callback = () => {
      setSteps(stepManager.getSteps())
      setNameFieldValue(stepManager.getName())
    };

    stepManager.subscribe(callback);

    return () => {
      stepManager.unsubscribe(callback);
    }
  }, [stepManager]);

  const renderNameField = () => (
    <TextField
      id="name-field"
      label="Name"
      variant="outlined"
      value={nameFieldValue}
      onChange={(event) => {stepManager.setName(event.target.value)}}
      className={styles.nameField}
    />
  );

  const handleDelete = (index: number) => {
    stepManager.deleteAt(index);
    setSteps(stepManager.getSteps());
  };

  const moveItem = (dragId: string, dropId: string) => {
    stepManager.moveStep(dragId, dropId);
  };

  const handleAddStep = () => {
    stepManager.addStep();
  };

  const renderAddStepButton = () => (
    <Grid item xs={12} lg={6} xl={3} key={"new step"}>
      <Button
        variant="contained"
        color="primary"
        onClick={handleAddStep}
        startIcon={<AddIcon />}
      >
        Add Step
      </Button>
    </Grid>
  );

  const renderStepOutput = (): JSX.Element[] => {
    const outputElements: JSX.Element[] = [];

    steps.forEach((step, index) => {
      outputElements.push(
        <Grid item xs={12} lg={6} xl={3} key={step.uuid}>
          <StepEditor
            step={step}
            onDelete={() => handleDelete(index)}
            moveItem={moveItem}
          />
        </Grid>
      );
    });

    return outputElements;
  };

  const darkTheme = createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#1976d2',
      },
    },
  });

  return (
    <div>
      <ThemeProvider theme={darkTheme}>
        <DndProvider backend={HTML5Backend}>
          <Grid className={styles.outerGrid} container spacing={2}>
            <Grid item md={12}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                {renderNameField()}
              </Box>
            </Grid>
            {renderStepOutput()}
            {renderAddStepButton()}
          </Grid>
        </DndProvider>
      </ThemeProvider>
    </div>
  );
}
