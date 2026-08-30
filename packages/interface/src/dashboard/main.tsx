import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { App } from './App';
import { I18nProvider } from './i18n/provider';
import './theme.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Dashboard root element is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <App />
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--color-overlay)',
              border: '1px solid var(--color-line-strong)',
              color: 'var(--color-ink)',
            },
          }}
        />
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
