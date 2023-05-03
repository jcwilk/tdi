import React, { useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Toolbar,
  Typography,
  Slider,
  IconButton
} from '@mui/material';
import { Step } from '../step';
import BoxPopup from './box_popup';
import styles from './css/step_editors.module.css';
import ReplayCircleFilledIcon from '@mui/icons-material/ReplayCircleFilled';
import PlayDisabledIcon from '@mui/icons-material/PlayDisabled';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import StepSpecEditor from './step_spec_editor'

interface StepEditorProps {
  step: Step;
  index: number;
  onDelete: any;
}

export default function StepEditor({ step, onDelete }: StepEditorProps) {
  const [openEditor, setOpenEditor] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleTemperatureChange = (event: Event, newValue: number | number[]) => {
    step.setTemperature(newValue as number);
  };

  const handleStep = async () => {
    setIsLoading(true);
    await step.runCompletion();
    setIsLoading(false);
  };

  const handleClickOpen = (fieldId: string) => {
    setOpenEditor(fieldId);
  };

  const handleClose = (key: string, text: string) => {
    step.setOutputData(key, text);
    setOpenEditor("");
  };

  const handleSubmit = (key: string, text: string) => {
    handleClose(key, text);
    handleStep();
  }

  const renderChips = (key: string, text: string) => {
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

  const renderTextDisplay = () => {
    const outputElements: JSX.Element[] = [];

    for (let [key, text] of Object.entries(step.getOutputData())) {
      const fieldId = `${step.uuid}-${key}`;
      const isReady = step.getKeyType(key) === "input"
      outputElements.push(
        <React.Fragment key={fieldId}>
          <Box onClick={() => handleClickOpen(fieldId)} className={styles.textDisplayBox}>
            {renderChips(key, text)}
            {text}
          </Box>
          <BoxPopup
            fieldId={fieldId}
            openEditor={openEditor}
            onClose={(text: string) => handleClose(key, text)}
            onSubmit={(text: string) => isReady ? handleSubmit(key, text) : true}
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

  const renderButton = () => {
    if (isLoading)
      return (
        <Button color="inherit">
          <CircularProgress size={24} />
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
        <Button color="inherit" onClick={handleStep}>
          <ReplayCircleFilledIcon />
        </Button>
      );
    else
      return (
        <Button color="inherit" onClick={handleStep}>
          <PlayArrowIcon />
        </Button>
      );
  }

  const renderTemperatureSlider = () => (
    <>
      <Slider
        value={step.getTemperature()}
        step={0.1}
        marks
        min={0.1}
        max={2}
        onChange={handleTemperatureChange}
      />
    </>
  );

  const handleEditStep = (): void => {
    setOpenEditor(`step-editor-${step.uuid}`)
  }

  const renderEdit = () => (
    <>
      <IconButton onClick={handleEditStep}>
        <EditIcon fontSize='small'/>
      </IconButton>
      <StepSpecEditor
        step={step}
        open={`step-editor-${step.uuid}` === openEditor}
        onClose={() => setOpenEditor('')}
      />
    </>
  )

  const renderDelete = () => (
    <>
      <IconButton onClick={onDelete}>
        <DeleteForeverIcon fontSize='small'/>
      </IconButton>
    </>
  )

  return (
    <Box className={styles.stepBox}>
      <AppBar position="static" color="secondary">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {step.getDescription()}
          </Typography>
          {renderEdit()}
          {renderDelete()}
        </Toolbar>
      </AppBar>
      <Box component="main" className={styles.stepOutputContentsBox}>
        <>
          {renderTextDisplay()}
        </>

        <Box className={styles.stepControls}>
          {step.areDependentsSatisfied() && (
            <>
              {renderTemperatureSlider()}
              {renderButton()}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
