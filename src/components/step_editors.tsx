import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Slider,
  TextField,
  Toolbar,
  Typography,
  IconButton,
} from '@mui/material';
import { StepManager } from '../step_manager';
import { Step } from '../step';
import BoxPopup from './box_popup';
import styles from './css/step_editors.module.css';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ReplayCircleFilledIcon from '@mui/icons-material/ReplayCircleFilled';
import PlayDisabledIcon from '@mui/icons-material/PlayDisabled';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import StepSpecEditor from './step_spec_editor'

interface StepEditorsProps {
  stepManager: StepManager;
}

export default function StepEditors({ stepManager }: StepEditorsProps) {
  const steps = stepManager.getSteps();
  const nameFieldValue = stepManager.getName();

  const [openEditor, setOpenEditor] = useState("");
  const [isLoading, setIsLoading] = useState(-1);
  const [updateCounter, setUpdateCounter] = useState(0);

  const bumpCounter = () => setUpdateCounter((prevCounter) => prevCounter + 1)

  useEffect(() => {
    stepManager.setOnStepCompleted(bumpCounter);
  }, []);

  const handleTemperatureChange = (index: number) => (event: Event, newValue: number | number[]) => {
    steps[index].setTemperature(newValue as number);
    bumpCounter();
  };

  const handleStep = async (step: Step, index: number) => {
    setIsLoading(index);
    await step.runCompletion();
    setIsLoading(-1);
  };

  const handleClickOpen = (fieldId: string) => {
    setOpenEditor(fieldId);
  };

  const handleClose = (step: Step, key: string, text: string) => {
    step.setOutputData(key, text);
    setOpenEditor("");
  };

  const handleSubmit = (step: Step, index: number, key: string, text: string) => {
    handleClose(step, key, text);
    handleStep(step, index);
  }

  const renderChips = (step: Step, key: string, text: string) => {
    const keyType = step.getKeyType(key);
    return <Box style={{ float: "right" }}>
      <Chip
        className={styles.fieldStatusChip}
        variant="outlined"
        color="secondary"
        size="small"
        label={keyType}
      />
      <Chip
        className={styles.fieldStatusChip}
        variant="outlined"
        color={text ? "primary" : "warning"}
        size="small"
        label={key}
      />
    </Box>
  }

  const renderTextDisplay = (step: Step, index: number) => {
    const outputElements: JSX.Element[] = [];

    for (let [key, text] of Object.entries(step.getOutputData())) {
      const fieldId = `${index}-${key}`;
      const isReady = step.getKeyType(key) === "input"
      outputElements.push(
        <React.Fragment key={fieldId}>
          <Box onClick={() => handleClickOpen(fieldId)} className={styles.textDisplayBox}>
            {renderChips(step, key, text)}
            {text}
          </Box>
          <BoxPopup
            fieldId={fieldId}
            openEditor={openEditor}
            onClose={(text: string) => handleClose(step, key, text)}
            onSubmit={(text: string) => isReady ? handleSubmit(step, index, key, text) : true}
            onSubmitText={isReady ? "Run Completions" : null}
            description={step.getDescription()}
            text={text}
            fieldName={key}
          />
        </React.Fragment>
      )
    }

    return outputElements;
  };

  const renderNameField = () => (
    <TextField
      id="name-field"
      label="Name"
      variant="outlined"
      value={nameFieldValue}
      onChange={(event) => {stepManager.setName(event.target.value); bumpCounter()}}
      className={styles.nameField}
    />
  );

  const renderButton = (step: Step, index: number) => {
    if (isLoading == index)
      return (
        <Button color="inherit">
          <CircularProgress size={25} />
        </Button>
      )
    else if (!step.areDependentsSatisfied())
      return (
        <Button color="inherit" disabled>
          <PlayDisabledIcon />
        </Button>
      )
    else if (step.isStepCompleted())
      return (
        <Button color="inherit" onClick={() => handleStep(step, index)}>
          <ReplayCircleFilledIcon />
        </Button>
      );
    else
      return (
        <Button color="inherit" onClick={() => handleStep(step, index)}>
          <PlayArrowIcon />
        </Button>
      );
  }

  const renderTemperatureSlider = (index: number) => (
    <>
      <Slider
        aria-labelledby={`temperature-slider-${index}`}
        value={steps[index].getTemperature()}
        step={0.1}
        marks
        min={0.1}
        max={2}
        onChange={handleTemperatureChange(index)}
      />
    </>
  );

  const handleEditStep = (index: number): void => {
    setOpenEditor(`step-editor-${index}`)
  }

  const renderStepOutput = (): JSX.Element[] => {
    const outputElements: JSX.Element[] = [];

    steps.forEach((step: Step, index: number) => {
      outputElements.push(
        <Grid item xs={12} lg={6} xl={3} key={index}>
          <Box className={styles.stepBox}>
            <AppBar position="static" color="secondary">
              <Toolbar>
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                  {step.getDescription()}

                </Typography>
                <StepSpecEditor
                  step={step}
                  open={`step-editor-${index}` === openEditor}
                  onClose={() => setOpenEditor('')}
                />
                <IconButton onClick={() => handleEditStep(index)}>
                  <EditIcon />
                </IconButton>
              </Toolbar>
            </AppBar>
            <Box component="main" className={styles.stepOutputContentsBox}>
              <>
                {renderTextDisplay(step, index)}
              </>

              <Box className={styles.stepControls}>
                {step.areDependentsSatisfied() && (
                  <>
                    {renderTemperatureSlider(index)}
                    {renderButton(step, index)}
                  </>
                )}
              </Box>
            </Box>
          </Box>
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
