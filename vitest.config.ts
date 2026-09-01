import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * One workspace-wide vitest config rather than one per package. Scanner
 * fixtures live under each package's src, so a single include glob is
 * enough.
 *
 * Two projects split the wall-clock cost of a full run without dropping
 * any suite: `unit` (the default `pnpm test` loop) covers everything
 * except browser/pipeline end-to-end files, and `e2e` (pnpm run test:e2e)
 * covers the `*.e2e.test.ts` files that launch Chromium, vite fixture
 * servers, and forked Lighthouse runs. `pnpm run test:all` runs both, and
 * CI gates on exactly that, so the full suite is still mandatory.
 *
 * passWithNoTests: true because early phases had intentionally empty
 * suites; keeping it avoids breaking focused runs.
 *
 * Aliases resolve `@odysseus/*` to package sources instead of built dist,
 * so test runs never depend on `tsc -b` having been executed first and can
 * never exercise stale build output. Every cross-package import in the
 * workspace is a root specifier (`@odysseus/core`, no subpaths), so exact
 * matches are sufficient; the copied config JSONs are read relative to
 * import.meta.url and exist under src, so source execution finds them.
 */
const workspaceSourceAliases = ['core', 'store', 'scanner', 'llm', 'interface', 'report'].map(
  (name) => ({
    find: new RegExp(`^@odysseus/${name}$`),
    replacement: fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
  }),
);

export default defineConfig({
  /** The dashboard tsconfig's react-jsx setting is invisible to esbuild
   *  (it only reads files named tsconfig.json), so rendering tests need
   *  the automatic JSX runtime spelled out here. */
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: workspaceSourceAliases,
  },
  test: {
    passWithNoTests: true,
    environment: 'node',
    globalSetup: ['./scripts/vitest-global-setup.mjs'],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/**/*.{test,spec}.ts'],
          exclude: [...configDefaults.exclude, 'packages/**/*.e2e.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['packages/**/*.e2e.test.ts'],
          globalSetup: [
            './scripts/vitest-global-setup.mjs',
            './scripts/vitest-e2e-global-setup.mjs',
          ],
        },
      },
    ],
  },
});
