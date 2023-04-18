import React, { useState, useEffect, useRef } from 'react';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import { StepManager } from '../step_manager';
import { StepHandler } from '../step_handler';
import TextField from '@mui/material/TextField';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import DialogContent from '@mui/material/DialogContent';
import Dialog from '@mui/material/Dialog';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import CodeFlask from 'codeflask';
import Slide from '@mui/material/Slide';

interface StepEditorsProps {
  stepManager: StepManager;
  apiKey: string | null;
  updateTrigger: number;
}

export default function StepEditors({ stepManager, apiKey, updateTrigger }: StepEditorsProps) {
  const [stepData, setStepData] = useState(stepManager.getStepData());
  const [stepHandler] = useState(new StepHandler(stepManager));
  const [temperatureValues, setTemperatureValues] = useState<number[]>([1, 1, 1]);
  const [nameFieldValue, setNameFieldValue] = useState(stepManager.getName());
  const [openEditor, setOpenEditor] = useState(-1);
  const domElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setStepData(stepManager.getStepData());
    const name = stepManager.getName();
    if (name && name !== '') {
      setNameFieldValue(name);
    }
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
    stepHandler.handleStep(step, apiKey, temperature);
  };

  const handleClickOpen = (index: number) => {
    setOpenEditor(index);
  };

  const handleClose = () => {
    setOpenEditor(-1);
  };

  const renderFullScreenEditor = (index: number) => {
    const idValue = `code-editor-${index}`;

    return (
      <Dialog
        fullScreen
        open={index === openEditor}
        onClose={handleClose}
        TransitionComponent={Slide}
        TransitionProps={{
          onEntered: () => {
            if (index === openEditor) {
              domElementRef.current = document.getElementById(idValue) as HTMLDivElement;
              const flask = new CodeFlask(domElementRef.current, {
                language: "javascript",
                lineNumbers: true,
              });

              flask.updateCode(stepData[openEditor].outputText);
              flask.onUpdate((code) => {
                stepManager.updateStepOutput(index, code);
              });
            }
          },
        }}
      >
        <AppBar sx={{ position: 'relative' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={handleClose}
              aria-label="close"
            >
              <Typography variant="h6">X</Typography>
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              Sound
            </Typography>
            <Button autoFocus color="inherit" onClick={handleClose}>
              save
            </Button>
          </Toolbar>
        </AppBar>
        <DialogContent>
          <div id={idValue} />
        </DialogContent>
      </Dialog>
    );
  }

  const renderTextDisplay = (index: number) => (
    <Box
      onClick={() => handleClickOpen(index)}
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
      {stepData[index].outputText}
    </Box>
  );

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
            const enabled = event.target.checked;
            stepManager.setAutoRetryEnabled(enabled);
            if (enabled) {
              handleStep(2, 2);
            }
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
          {renderTextDisplay(index)}
          {renderFullScreenEditor(index)}
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
      {renderNameField()}
      {renderStepOutput()}
    </div>
  );
}
