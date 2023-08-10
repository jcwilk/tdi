import React from 'react';
import { createRoot } from 'react-dom/client';
import TextFieldsForm from './components/text_fields_form';
import { BrowserRouter as Router } from 'react-router-dom';

const App = () => {
  return (
    <Router>
      <div>
        <TextFieldsForm />
      </div>
    </Router>
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
