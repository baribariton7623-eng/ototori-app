import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RepertoireApp from './RepertoireApp';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RepertoireApp />
  </StrictMode>,
);
