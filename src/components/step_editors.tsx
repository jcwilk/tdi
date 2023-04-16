import React, { useState, useEffect } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import { StepManager } from '../step_manager';
import CodeEditor from './code_editor';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';

interface StepEditorsProps {
  stepManager: StepManager;
  apiKey: string | null;
  updateTrigger: number;
}

export default function StepEditors({ stepManager, apiKey, updateTrigger }: StepEditorsProps) {
  const [stepData, setStepData] = useState(stepManager.getStepData());
  const [temperatureValues, setTemperatureValues] = useState<number[]>([1, 1, 1]);

  useEffect(() => {
    setStepData(stepManager.getStepData());
  }, [updateTrigger]);

  const stepDescriptions = [
    'Described Problem:',
    'Examples:',
    'Jasmine Tests',
    'Function Code:',
  ];

  const buttonLabels = [
    'Generate Examples',
    'Generate Jasmine Tests',
    'Generate Function Code',
  ];

  const handleTemperatureChange = (index: number) => (event: Event, newValue: number | number[]) => {
    const newTemperatureValues = [...temperatureValues];
    newTemperatureValues[index] = newValue as number;
    setTemperatureValues(newTemperatureValues);
  };

  const handleStep = (step: number, index: number) => {
    const temperature = temperatureValues[index];
    stepManager.handleStep(step, apiKey, temperature);
  };

  const renderButton = (step: number, index: number) => {
    return (
      <Button variant="contained" onClick={() => handleStep(step, index)}>
        {buttonLabels[index]}
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
        value={temperatureValues[index]}
        step={0.1}
        marks
        min={0.1}
        max={2}
        valueLabelDisplay="auto"
        onChange={handleTemperatureChange(index)}
      />
    </>
  );

  const renderAutoRetryToggle = () => (
    <FormControlLabel
      control={
        <Switch
          checked={stepManager.isAutoRetryEnabled()}
          onChange={(event) => {
            const temperature = temperatureValues[2];
            stepManager.setAutoRetryEnabled(event.target.checked, apiKey, temperature);
          }}
          name="autoRetryEnabled"
          color="primary"
        />
      }
      label="Auto-Retry"
    />
  );

  const renderStepOutput = (): JSX.Element[] => {

    const outputElements: JSX.Element[] = [];

    stepData.forEach(({ outputText, step }, index) => {
      outputElements.push(
        <div key={index}>
          <h2>{stepDescriptions[index]}</h2>
          <CodeEditor
            value={outputText}
            onChange={(value: string) => stepManager.updateStepOutput(index, value)}
            height="150px"
            />
            {step < 3 && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginTop: 1,
                }}
              >
                {renderButton(step, index)}
                {renderTemperatureSlider(index)}
              </Box>
            )}
            {step === 3 && !stepManager.getSuccess() && renderAutoRetryToggle()}
          </div>
        );
      });

      return outputElements;
    };
  return (
    <div>
      {renderStepOutput()}
    </div>
  );
}
