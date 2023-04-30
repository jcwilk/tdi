import React, { useState } from 'react';
import { APIKeyStorer } from '../api_key_storage';

interface ApiKeyEntryProps {
  onSubmit: () => void;
}

const ApiKeyEntry: React.FC<ApiKeyEntryProps> = ({ onSubmit }) => {
  const [apiKey, setApiKey] = useState<string>('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    APIKeyStorer(apiKey);
    onSubmit();
  };

  return (
    <div>
      <h2>Enter API Key</h2>
      <p>
        Don't have an API key?{' '}
        <a href="https://platform.openai.com/account/api-keys" target="_blank" rel="noreferrer">
          Get one here
        </a>
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="apiKey">API Key:</label>
        <input type="text" id="apiKey" value={apiKey} onChange={handleChange} />
        <p style={{ color: 'red' }}>WARNING: DO NOT USE ON A PUBLIC COMPUTER</p>
        <button type="submit">Submit</button>
      </form>
    </div>
  );
};

export default ApiKeyEntry;
