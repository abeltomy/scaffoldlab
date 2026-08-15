import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { useAppStore } from './store/useAppStore';

// Dev-only handle: lets the console drive the pipeline (config, scale,
// regeneration) without wiring debug UI into the app.
if (import.meta.env.DEV) {
  (window as unknown as { scaffoldlab: unknown }).scaffoldlab = useAppStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
