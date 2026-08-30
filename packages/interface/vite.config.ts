import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const packageRoot = dirname(fileURLToPath(import.meta.url));

/** The dashboard shares the client report's self-hosted Inter files. The
 *  canonical source stays packages/report/src/fonts and is copied at build
 *  time, the same discipline the previous page stack used for nocturne.css,
 *  so the two surfaces can never drift onto different font versions. */
function copyInterFonts(): Plugin {
  return {
    name: 'copy-inter-fonts',
    apply: 'build',
    closeBundle() {
      const sourceDir = resolve(packageRoot, '../report/src/fonts');
      const targetDir = resolve(packageRoot, 'dist/public/fonts');
      mkdirSync(targetDir, { recursive: true });
      for (const fileName of readdirSync(sourceDir)) {
        if (fileName.endsWith('.woff2')) {
          copyFileSync(resolve(sourceDir, fileName), resolve(targetDir, fileName));
        }
      }
    },
  };
}

export default defineConfig({
  root: 'src/dashboard',
  base: '/',
  publicDir: false,
  plugins: [react(), tailwindcss(), copyInterFonts()],
  build: {
    outDir: '../../dist/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4600',
    },
  },
});
