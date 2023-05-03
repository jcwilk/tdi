import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  TextField,
} from '@mui/material';
import { StepManager } from '../step_manager';
import styles from './css/step_editors.module.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import StepEditor from './step_editor';

interface StepEditorsProps {
  stepManager: StepManager;
}

export default function StepEditors({ stepManager }: StepEditorsProps) {
  const nameFieldValue = stepManager.getName();

  const [steps, setSteps] = useState(stepManager.getSteps())

  useEffect(() => {
    const callback = () => {
      setSteps(stepManager.getSteps())
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

  const renderStepOutput = (): JSX.Element[] => {
    const outputElements: JSX.Element[] = [];

    steps.forEach((step, index) => {
      outputElements.push(
        <Grid item xs={12} lg={6} xl={3} key={step.uuid}>
          <StepEditor
            step={step}
            onDelete={() => handleDelete(index)}
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
        <Grid className={styles.outerGrid} container spacing={2}>
          <Grid item md={12}>
            {renderNameField()}
          </Grid>
          {renderStepOutput()}
        </Grid>
      </ThemeProvider>
    </div>
  );
}
