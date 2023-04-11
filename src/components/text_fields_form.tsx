import React, { useRef, useState } from 'react';
import { getCompletion } from '../openai_api';
import ApiKeyEntry from './api_key_entry';
import { StepManager, StepData } from '../step_manager';
import { getMainStepPrompt } from '../prompt_factory';

const TextFieldsForm: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [stepData, setStepData] = useState<StepData[]>([]);
  const [stepManager] = useState<StepManager>(new StepManager());
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('apiKey'));
  const requestCounter = useRef<number>(0);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(event.target.value);
  };

  const handleApiKeySubmit = (key: string) => {
    localStorage.setItem('apiKey', key);
    setApiKey(key);
  };

  const handleStep = async (nextStep: number) => {
    if (!apiKey) {
      alert('API Key is not set');
      return;
    }

    requestCounter.current += 1;
    const currentRequest = requestCounter.current;

    const completionText = await getCompletion(apiKey, getMainStepPrompt(inputText, stepData, nextStep));

    // Only process the result if the current request is the most recent one
    if (completionText !== undefined && currentRequest === requestCounter.current) {
      stepManager.addStepData(completionText, nextStep, setStepData, stepData);
    }
  };



  if (apiKey === null) {
    return <ApiKeyEntry onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div id="text-input-form">
      <form onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="inputText">Input Text:</label>
        <textarea
          id="inputText"
          value={inputText}
          onChange={handleChange}
          style={{
            width: '100%',
            minHeight: '50px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        />
        <button
          onClick={() => {
            stepManager.resetStepsAfter(-1, setStepData);
            handleStep(1);
          }}
        >
          Submit
        </button>
      </form>
      {stepManager.renderStepOutput(stepData, (nextStep: number) => {
        stepManager.resetStepsAfter(nextStep - 2, setStepData);
        handleStep(nextStep);
      })}
    </div>
  );
};

export default TextFieldsForm;
