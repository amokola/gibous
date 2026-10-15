import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initEventRouter } from './state/eventRouter';
import './index.css';

// Initialize WebSocket → Zustand event routing before React renders
initEventRouter();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
