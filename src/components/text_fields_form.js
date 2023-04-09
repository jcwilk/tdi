import React, { useState } from 'react';

const TextFieldsForm = () => {
  const [fields, setFields] = useState(['']);
  const [inputValues, setInputValues] = useState({});
  const [response, setResponse] = useState('');

  const handleChange = (event, index) => {
    const { value } = event.target;
    setInputValues({ ...inputValues, [index]: value });
  };

  const handleSubmit = async () => {
    const jsonPayload = JSON.stringify(inputValues);
    const response = await fetch('https://your-api-endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: jsonPayload,
    });

    const responseData = await response.json();
    setResponse(responseData.someKey);
  };

  const addField = () => {
    setFields([...fields, '']);
  };

  return (
    <div>
      {fields.map((field, index) => (
        <div key={index}>
          <input
            type="text"
            placeholder={`Field ${index + 1}`}
            value={inputValues[index] || ''}
            onChange={(e) => handleChange(e, index)}
          />
        </div>
      ))}
      <button onClick={addField}>Add field</button>
      <button onClick={handleSubmit}>Submit</button>
      {response && <div>API Response: {response}</div>}
    </div>
  );
};

export default TextFieldsForm;
