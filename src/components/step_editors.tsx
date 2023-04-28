import React, { useState, useEffect, useRef } from 'react';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import { StepManager } from '../step_manager';
import { Step } from '../step';
import TextField from '@mui/material/TextField';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import BoxPopup from './box_popup';

interface StepEditorsProps {
  stepManager: StepManager;
}

export default function StepEditors({ stepManager }: StepEditorsProps) {
  const steps = stepManager.getSteps();

  const [nameFieldValue, setNameFieldValue] = useState(stepManager.getName());
  const [openEditor, setOpenEditor] = useState("");
  const [isLoading, setIsLoading] = useState(-1);
  const [updateCounter, setUpdateCounter] = useState(0);

  useEffect(() => {
    stepManager.setOnStepCompleted(() => {
      setUpdateCounter((prevCounter) => prevCounter + 1);
    });
  }, []);

  useEffect(() => {
    const name = stepManager.getName();
    if (name && name !== '') {
      setNameFieldValue(name);
    }
  }, [updateCounter]);

  const handleTemperatureChange = (index: number) => (event: Event, newValue: number | number[]) => {
    steps[index].setTemperature(newValue as number);
  };

  const handleStep = async (step: Step, index: number) => {
    setIsLoading(index);
    const success = await step.runCompletion();
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

  const renderTextDisplay = (step: Step, index: number) => {
    const outputElements: JSX.Element[] = [];

    for (let [key, text] of Object.entries(step.getOutputData())) {
      const fieldId = `${index}-${key}`;
      outputElements.push(
        <React.Fragment key={fieldId}>
          <Box
            onClick={() => handleClickOpen(fieldId)}
            sx={{
              border: '1px solid rgba(211, 211, 211, 1)', // light gray
              borderRadius: 1,
              minHeight: '150px',
              padding: '8px',
              whiteSpace: 'pre-wrap',
              overflow: 'auto',
              wordWrap: 'break-word',
              cursor: 'pointer',
            }}
          >
            {text}
          </Box>
          <BoxPopup
            fieldId={fieldId}
            openEditor={openEditor}
            onClose={(text: string) => handleClose(step, key, text)}
            onSubmit={(text: string) => handleSubmit(step, index, key, text)}
            onSubmitText={"Run Completions"}
            description={step.getDescription()}
            text={text}
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
      onChange={(event) => setNameFieldValue(event.target.value)}
      onBlur={() => stepManager.setName(nameFieldValue)}
      sx={{
        marginBottom: 2,
        color: 'rgba(211, 211, 211, 1)', // light gray
        '& .MuiInputLabel-root': {
          color: 'rgba(211, 211, 211, 1)', // light gray
        },
        '& .MuiInputBase-root': {
          color: 'rgba(211, 211, 211, 1)', // light gray
        },
      }}
    />
  );

  const renderButton = (step: Step, index: number) => {
    if (isLoading == index)
      return <CircularProgress size={24} />
    else
      return (
        <Button variant="contained" onClick={() => handleStep(step, index)}>
          Generate Next
        </Button>
      );
  }

  const renderTemperatureSlider = (index: number) => (
    <>
      <Typography id={`temperature-slider-${index}`} gutterBottom>
        Temperature
      </Typography>
      <Slider
        aria-labelledby={`temperature-slider-${index}`}
        value={steps[index].getTemperature()}
        step={0.1}
        marks
        min={0.1}
        max={2}
        valueLabelDisplay="auto"
        onChange={handleTemperatureChange(index)}
      />
    </>
  );

  const renderStepOutput = (): JSX.Element[] => {
    const outputElements: JSX.Element[] = [];

    steps.forEach((step: Step, index: number) => {
      outputElements.push(
        <div key={index}>
          <h2>{step.getDescription()}</h2>
          {renderTextDisplay(step, index)}
          {index < steps.length && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginTop: 1,
              }}
            >
              {step.areDependentsSatisfied() && renderButton(step, index)}
              {step.areDependentsSatisfied() && renderTemperatureSlider(index)}
            </Box>
          )}
        </div>
      );
    });

    return outputElements;
  };

  return (
    <div>
      {renderNameField()}
      {renderStepOutput()}
    </div>
  );
}
