import React, { useState, useEffect } from 'react';
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
import { ConnectableElement, useDrag, useDrop } from 'react-dnd';

interface StepEditorProps {
  step: Step;
  onDelete: any;
  moveItem: (dragId: string, dropId: string) => void;
}

export default function StepEditor({ step, onDelete, moveItem }: StepEditorProps) {
  const [openEditor, setOpenEditor] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [temperature, setTemperature] = useState(step.getTemperature())
  const [isComplete, setIsComplete] = useState(step.isStepCompleted())
  const [dependentsSatisfied, setDependentsSatisfied] = useState(step.areDependentsSatisfied())
  const [description, setDescription] = useState(step.getDescription())

  useEffect(() => {
    const callback = () => {
      setTemperature(step.getTemperature())
      setIsComplete(step.isStepCompleted())
      setDependentsSatisfied(step.areDependentsSatisfied())
      setDescription(step.getDescription())
    };

    step.subscribe(callback);

    return () => {
      step.unsubscribe(callback);
    }
  }, [step]);

  const [, drag] = useDrag(() => ({
    type: 'STEP_EDITOR',
    item: { id: step.uuid },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  const [, drop] = useDrop(() => ({
    accept: 'STEP_EDITOR',
    drop: (item) => moveItem(item.id, step.uuid),
  }));

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
    else if (!dependentsSatisfied)
      return (
        <Button color="inherit" disabled>
          <PlayDisabledIcon />
        </Button>
      )
    else if (isComplete)
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
        value={temperature}
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
    <Box className={styles.stepBox} ref={(node: ConnectableElement) => drag(drop(node))}>
      <AppBar position="static" color="secondary">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {description}
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
          {dependentsSatisfied && (
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
