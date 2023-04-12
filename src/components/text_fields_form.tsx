import React, { useRef, useState } from 'react';
import { getCompletion } from '../openai_api';
import ApiKeyEntry from './api_key_entry';
import { StepManager } from '../step_manager';
import { getMainStepPrompt } from '../prompt_factory';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CodeEditor from './code_editor'; // Import the new CodeEditor component

export default function TextFieldsForm() {
  const [inputText, setInputText] = useState<string>('');
  const [stepManager] = useState<StepManager>(new StepManager());
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('apiKey'));
  const requestCounter = useRef<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const handleStep = async (nextStep: number) => {
    if (!apiKey) {
      alert('API Key is not set');
      return;
    }

    stepManager.resetStepsAfter(nextStep - 2);

    setLoading(true);

    try {
      requestCounter.current += 1;
      const currentRequest = requestCounter.current;

      const completionText = await getCompletion(apiKey, getMainStepPrompt(inputText, stepManager.getStepData(), nextStep));

      // Only process the result if the current request is the most recent one
      if (completionText !== undefined && currentRequest === requestCounter.current) {
        await stepManager.addStep(completionText, nextStep);
      }
    } catch (error) {
      // TODO: setErrorMessage('An error occurred while processing your request. Please try again.');
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
      <h2>Described Problem:</h2> {/* Add the description above the first editor */}
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
    </div>
  );
}
