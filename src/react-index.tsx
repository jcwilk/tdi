import React from 'react';
import { createRoot } from 'react-dom/client'
import TextFieldsForm from './components/text_fields_form';
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import { RouterState } from '@remix-run/router';
import { Subject } from 'rxjs';

const App = () => {
  return (
    <TextFieldsForm />
  );
};

const router = createBrowserRouter([
  // match everything with "*"
  { path: "*", element: <App /> }
]);

const routerStream = new Subject<RouterState>();

router.subscribe(routerState => routerStream.next(routerState));

(window as any).$app = { routerStream }; // hack to make the router trivially available for listening to events

const init = () => {
  const container = document.getElementById('react-root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <RouterProvider router={router} />
      </React.StrictMode>
    );
  } else {
    console.error('Target container is not found');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
