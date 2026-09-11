import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fontSourceDir = resolve(packageRoot, '../report/src/fonts');

/** The dashboard shares the client report's self-hosted Avenir Next Cyr
 *  files (plan 040 slice 3: Inter is retired here the way it was already
 *  retired from the report in plan 039). The canonical source stays
 *  packages/report/src/fonts: copied to dist/public at build time, and
 *  served from that same source directory by the dev middleware below, so
 *  both serving modes answer /fonts/AvenirNextCyr-*.woff2 from the same
 *  files and the two surfaces can never drift onto font versions.
 *  theme.css requests exactly these paths. */
const FONT_REQUEST_PATTERN = /^\/fonts\/(AvenirNextCyr-(?:Regular|Medium|Demi|Bold)\.woff2)$/;

function copyAvenirNextFonts(): Plugin {
  return {
    name: 'copy-avenir-next-fonts',
    closeBundle() {
      const targetDir = resolve(packageRoot, 'dist/public/fonts');
      mkdirSync(targetDir, { recursive: true });
      for (const fileName of readdirSync(fontSourceDir)) {
        if (fileName.endsWith('.woff2')) {
          copyFileSync(resolve(fontSourceDir, fileName), resolve(targetDir, fileName));
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = new URL(req.url ?? '/', 'http://localhost').pathname;
        // The pattern admits exactly the four canonical file names, so the
        // matched name can never carry path segments.
        const fileName = FONT_REQUEST_PATTERN.exec(requestPath)?.[1];
        if (fileName === undefined || !existsSync(resolve(fontSourceDir, fileName))) {
          next();
          return;
        }
        res.setHeader('content-type', 'font/woff2');
        createReadStream(resolve(fontSourceDir, fileName)).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: 'src/dashboard',
  base: '/',
  publicDir: false,
  plugins: [react(), tailwindcss(), copyAvenirNextFonts()],
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
