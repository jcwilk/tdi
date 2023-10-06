import React from 'react';
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import { RouterState } from '@remix-run/router';
import { BehaviorSubject } from 'rxjs';
import Client from './components/chat/client';
import './index.css';

const App = () => {
  return (
    <Client />
  );
};

const router = createBrowserRouter([
  // match everything with "*"
  { path: "*", element: <App /> }
]);

const routerStream = new BehaviorSubject<RouterState>(router.state);

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
