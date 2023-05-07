import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  Toolbar,
  Typography,
  Slider,
  IconButton
} from '@mui/material';
import { Step } from '../step';
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
  dependentData: { [key: string]: string };
}

export default function StepEditor({ step, onDelete, moveItem, dependentData }: StepEditorProps) {
  const [openEditor, setOpenEditor] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [temperature, setTemperature] = useState(step.getTemperature())
  const [isComplete, setIsComplete] = useState(step.isStepCompleted(dependentData))
  const [dependentsSatisfied, setDependentsSatisfied] = useState(step.areDependentsSatisfied(dependentData))
  const [description, setDescription] = useState(step.getDescription())

  useEffect(() => {
    setDependentsSatisfied(step.areDependentsSatisfied(dependentData))
    setIsComplete(step.isStepCompleted(dependentData))
  }, [dependentData])

  useEffect(() => {
    const callback = () => {
      setDependentsSatisfied(step.areDependentsSatisfied(dependentData))
      setIsComplete(step.isStepCompleted(dependentData))

      setTemperature(step.getTemperature())
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
    drop: (item: {[key: string]: string}) => moveItem(item.id, step.uuid),
  }));

  const handleTemperatureChange = (event: Event, newValue: number | number[]) => {
    step.setTemperature(newValue as number);
  };

  const handleStep = async () => {
    setIsLoading(true);
    await step.runCompletion(dependentData);
    setIsLoading(false);
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
        dependentData={dependentData}
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
