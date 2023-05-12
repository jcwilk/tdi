import React, { useState, useEffect, useRef } from 'react';
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StepSpecEditor from './step_spec_editor'
import { ConnectableElement, useDrag, useDrop } from 'react-dnd';

interface StepEditorProps {
  step: Step;
  onDelete: () => void;
  onDuplicate: () => void;
  moveItem: (dragId: string, dropId: string) => void;
  dependentData: { [key: string]: string };
  setIsLoading: (loading: boolean) => void
  isLoading: boolean
}

export default function StepEditor({ step, onDelete, onDuplicate, moveItem, dependentData, setIsLoading, isLoading }: StepEditorProps) {
  const [openEditor, setOpenEditor] = useState("");
  const [temperature, setTemperature] = useState(step.getTemperature())
  const [isComplete, setIsComplete] = useState(step.isStepCompleted(dependentData))
  const [dependentsSatisfied, setDependentsSatisfied] = useState(step.areDependentsSatisfied(dependentData))
  const [description, setDescription] = useState(step.getDescription())

  const stepRef = useRef(step);
  const dependentDataRef = useRef(dependentData)

  useEffect(() => {
    stepRef.current = step;
    dependentDataRef.current = dependentData;

    setDependentsSatisfied(step.areDependentsSatisfied(dependentData))
    setIsComplete(step.isStepCompleted(dependentData))
  }, [dependentData, step])

  useEffect(() => {
    const callback = () => {
      setDependentsSatisfied(stepRef.current.areDependentsSatisfied(dependentDataRef.current))
      setIsComplete(stepRef.current.isStepCompleted(dependentDataRef.current))

      setTemperature(stepRef.current.getTemperature())
      setDescription(stepRef.current.getDescription())
    };

    step.subscribe(callback);

    return () => {
      stepRef.current.unsubscribe(callback);
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
        <Button color="inherit" disabled>
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

  const renderDuplicate = () => (
    <>
      <IconButton onClick={onDuplicate}>
        <ContentCopyIcon fontSize='small'/>
      </IconButton>
    </>
  )

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
          {renderDuplicate()}
          {renderEdit()}
          {renderDelete()}
        </Toolbar>
      </AppBar>
      <Box component="main" className={styles.stepOutputContentsBox}>
        <Box className={styles.stepControls}>
          {dependentsSatisfied && (
            <>
              {renderButton()}
              {step.hasCompletions() && renderTemperatureSlider()}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
