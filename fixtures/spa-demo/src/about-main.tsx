import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import About from './About';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <About />
  </StrictMode>,
);
