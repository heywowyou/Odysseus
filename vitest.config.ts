import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * One workspace-wide vitest config rather than one per package. Scanner
 * fixtures live under each package's src, so a single include glob is
 * enough.
 *
 * Three projects split the wall-clock cost of a full run without dropping
 * any suite: `unit` (the default `pnpm test` loop) covers everything
 * except browser/pipeline end-to-end files, `e2e` (pnpm run test:e2e)
 * covers the `*.e2e.test.ts` files that launch Chromium, vite fixture
 * servers, and forked Lighthouse runs, and `e2e-serial` holds the
 * CPU-bound pixel-constraint suite. Vitest schedules projects sharing a
 * `sequence.groupOrder` together and runs groups strictly one after
 * another, so group 1 gives image.e2e.test.ts the whole machine after
 * every group 0 file has finished. Under full parallelism that suite
 * repeatedly crossed its 15s per-test ceiling purely from CPU contention
 * (it runs in 4-6s per test in isolation), which is why `test:e2e`
 * selects both projects with the `e2e*` filter.
 * `pnpm run test:all` runs all of them, and CI gates on exactly that, so
 * the full suite is still mandatory.
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
    /** The 5s vitest default is a browser-era default, not a measured
     *  bound: the store tier runs real Mongo I/O against the Docker
     *  container, and under a full parallel run individual tests
     *  routinely and randomly crossed 5s while their suites passed every
     *  time in isolation. A ceiling only matters when a test is genuinely
     *  stuck, and a stuck test is just as stuck at 20s; a passing suite
     *  never waits on it. */
    testTimeout: 20_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['packages/**/*.{test,spec}.{ts,tsx}'],
          exclude: [...configDefaults.exclude, 'packages/**/*.e2e.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['packages/**/*.e2e.test.{ts,tsx}'],
          exclude: [
            ...configDefaults.exclude,
            'packages/scanner/src/prescan/evidence/image.e2e.test.ts',
          ],
          globalSetup: [
            './scripts/vitest-global-setup.mjs',
            './scripts/vitest-e2e-global-setup.mjs',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e-serial',
          include: ['packages/scanner/src/prescan/evidence/image.e2e.test.ts'],
          sequence: {
            groupOrder: 1,
          },
        },
      },
    ],
  },
});
