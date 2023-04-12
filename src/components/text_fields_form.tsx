import React, { useRef, useState, useEffect } from 'react';
import { getCompletion } from '../openai_api';
import ApiKeyEntry from './api_key_entry';
import { StepManager } from '../step_manager';
import { getMainStepPrompt } from '../prompt_factory';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CodeEditor from './code_editor';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';

export default function TextFieldsForm() {
  const [inputText, setInputText] = useState<string>('');
  const [stepManager] = useState<StepManager>(new StepManager());
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('apiKey'));
  const requestCounter = useRef<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [temperature, setTemperature] = useState<number>(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [autoRetry, setAutoRetry] = useState<boolean>(false);
  const autoRetryRef = useRef<boolean>(false);

  useEffect(() => {
    autoRetryRef.current = autoRetry
    if(autoRetry) handleStep(3, true);
  }, [autoRetry]);

  const toggleAutoRetry = () => {
    setAutoRetry(!autoRetry);
  };

  const handleTemperatureChange = (event: Event, newValue: number | number[]) => {
    setTemperature(newValue as number);
  };

  const handleStep = async (nextStep: number, autoRetryActive = false) => {
    if (!apiKey) {
      alert('API Key is not set');
      return;
    }

    if (autoRetryActive && !autoRetryRef.current) {
      return;
    }

    stepManager.resetStepsAfter(nextStep - 2);

    setLoading(true);
    setErrorMessage(null);

    try {
      requestCounter.current += 1;
      const currentRequest = requestCounter.current;

      const completionText = await getCompletion(apiKey, getMainStepPrompt(inputText, stepManager.getStepData(), nextStep), undefined, temperature);

      // Only process the result if the current request is the most recent one
      if (completionText !== undefined && currentRequest === requestCounter.current) {
        const result = await stepManager.addStep(completionText, nextStep);
        if (nextStep === 3) {
          setSuccess(result);
          if (result) {
            setAutoRetry(false);
          } else if (autoRetryRef.current) {
            setTimeout(() => {
              handleStep(3, true);
            }, 1000);
          }
        }
      }
    } catch (error) {
      setErrorMessage('An error occurred while processing your request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (value: string) => {
    setInputText(value);
  };

  const handleApiKeySubmit = (key: string) => {
    localStorage.setItem('apiKey', key);
    setApiKey(key);
  };

  const renderStepOutput = (): JSX.Element[] => {
    const stepDescriptions = [
      "Examples:",
      "Jasmine Tests",
      "Function Code:"
    ];

    const buttonLabels = [
      "Generate Jasmine Tests",
      "Generate Function Code",
    ];

    const outputElements: JSX.Element[] = [];

    stepManager.getStepData().forEach(({ outputText, step }, index) => {
      outputElements.push(
        <div key={index}>
          <h2>{stepDescriptions[index]}</h2>
          <CodeEditor
            value={outputText}
            onChange={(value: string) => stepManager.updateStepOutput(index, value)}
            height="150px"
          />
          {step < 3 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 1 }}>
              <Button
                variant="contained"
                onClick={() => handleStep(step + 1)}
              >
                {buttonLabels[index]}
              </Button>
            </Box>
          )}
        </div>
      );
    });

    return outputElements;
  };

  if (apiKey === null) {
    return <ApiKeyEntry onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div id="text-input-form">
      <h2>Described Problem:</h2>
      <form onSubmit={(e) => e.preventDefault()}>
        <CodeEditor
          value={inputText}
          onChange={handleChange}
          height="150px"
        />
        <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 1 }}>
          <Button
            variant="contained"
            onClick={() => {
              handleStep(1);
            }}
          >
            Generate Examples
          </Button>
        </Box>
      </form>
      {renderStepOutput()}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 1 }}>
          <CircularProgress />
        </Box>
      )}
      {errorMessage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 1, color: 'error.main' }}>
          <Typography>{errorMessage}</Typography>
        </Box>
      )}

      {stepManager.getStepData().length === 3 && !success && (
        <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 1 }}>
          <Button
            variant="contained"
            color={autoRetry ? "secondary" : "primary"}
            onClick={toggleAutoRetry}
          >
            {autoRetry ? "Disable Auto-retry" : "Auto-retry"}
          </Button>
        </Box>
      )}
      <Box sx={{ position: 'absolute', top: 0, right: 0, paddingRight: 2 }}>
        <Typography id="temperature-slider" gutterBottom>
          Temperature
        </Typography>
        <Slider
          aria-labelledby="temperature-slider"
          value={temperature}
          step={0.1}
          marks
          min={0.1}
          max={2}
          valueLabelDisplay="auto"
          onChange={handleTemperatureChange}
        />
      </Box>
    </div>
  );
}
