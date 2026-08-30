import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { I18nProvider } from './i18n/provider';
import './theme.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Dashboard root element is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename="/dashboard">
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
