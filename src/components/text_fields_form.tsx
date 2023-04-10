// TextFieldsForm.tsx
import React, { useState } from 'react';
import { getCompletion } from '../openai_api';
import ApiKeyEntry from './api_key_entry';

const TextFieldsForm: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('apiKey'));

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(event.target.value);
  };

  const handleApiKeySubmit = (key: string) => {
    localStorage.setItem('apiKey', key);
    setApiKey(key);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!apiKey) {
      alert('API Key is not set');
      return;
    }

    const completionText = await getCompletion(apiKey, inputText, 2000);
    if (completionText) {
      setOutputText(completionText);
    }
  };

  if (apiKey === null) {
    return <ApiKeyEntry onSubmit={handleApiKeySubmit} />;
  }

  return (
    <div>
      <h1>Text Input Form</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="inputText">Input Text:</label>
        <input type="text" id="inputText" value={inputText} onChange={handleChange} />
        <button type="submit">Submit</button>
      </form>
      <h2>Output Text:</h2>
      <div
        style={{
          maxWidth: '600px',
          lineHeight: '1.5',
          wordWrap: 'break-word',
          backgroundColor: '#f0f0f0',
          padding: '10px',
          borderRadius: '5px',
        }}
      >
        <p style={{ color: '#333' }}>{outputText}</p>
      </div>
    </div>
  );
};

export default TextFieldsForm;
