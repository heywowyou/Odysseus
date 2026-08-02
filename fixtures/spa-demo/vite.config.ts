import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plain client-rendered SPA, no SSR, no prerendering. The raw HTML this
// serves is deliberately near-empty; that gap is what the render diff
// scanner measures.
export default defineConfig({
  plugins: [react()],
});
