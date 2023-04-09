import React from 'react';
import { createRoot } from 'react-dom/client';
import TextFieldsForm from './components/text_fields_form';

const App = () => {
  return (
    <div>
      <h1>TDI Prototype</h1>
      <TextFieldsForm />
    </div>
  );
};

const init = () => {
  const container = document.getElementById('react-root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  } else {
    console.error('Target container is not found');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
