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
 * another: `unit` first, then `e2e`, then `e2e-serial`, which gets the
 * whole machine after every other file has finished. Under full
 * parallelism that suite repeatedly crossed its 15s per-test ceiling purely
 * from CPU contention (it runs in 4-6s per test in isolation), which is why
 * `test:e2e` selects both e2e projects with the `e2e*` filter.
 *
 * `e2e` used to share group 0 with `unit`. On 2026-09-28 four gate runs in
 * a row each failed on a different e2e test (crawl pacing, video audio,
 * challenge-frame pacing, write-audit and scan-site timeouts), and every one
 * passed alone: Chromium, Lighthouse and real-time pacing assertions starved
 * behind six thousand unit tests. So `e2e` now runs after `unit`, on at most
 * four workers, and retries a failed test once; a real defect fails both
 * attempts, and the reporter still names the retry.
 * `pnpm run test:all` runs all of them, and the release gate
 * (`pnpm run gate`) runs exactly that, so the full suite is still mandatory.
 *
 * passWithNoTests: true because early phases had intentionally empty
 * suites; keeping it avoids breaking focused runs. The release gate turns it
 * off for its full run (scripts/gate.sh).
 *
 * allowOnly: false everywhere (issue #545). Vitest's default allows a
 * committed `it.only` whenever CI is unset, and since trade-off 120 nothing
 * sets it, so one `.only` made the gate run a fraction of the suite and
 * pass. A focused run uses a file or `-t` filter instead.
 *
 * Aliases resolve `@odysseus/*` to package sources instead of built dist,
 * so test runs never depend on `tsc -b` having been executed first and can
 * never exercise stale build output. A root specifier (`@odysseus/core`)
 * maps to the package's src/index.ts; a subpath (`@odysseus/store/
 * test-support.js`, which package.json's `./*` export sends to dist) maps to
 * the matching src module, so a fresh clone with no dist runs the Mongo
 * suites too (issue #544). scripts/workspace-subpath-imports.test.mjs fails
 * on a subpath these aliases cannot resolve. The copied config JSONs are
 * read relative to import.meta.url and exist under src, so source execution
 * finds them.
 */
/**
 * Every run uses UTC, so a test that formats a timestamp in the default time
 * zone gives the same text on the operator's Paris machine as on any other.
 * Set here, before any worker starts, so each inherits it.
 */
process.env.TZ = 'UTC';

/**
 * The scanner and llm packages load the repository .env on first use. On the
 * operator's machine that file holds real credentials, so a test reached a
 * live service with them (a CrUX call failed a run with a 503). Every run
 * loads an empty file instead, as CI's checkout, which had no .env, did.
 */
process.env.ODYSSEUS_ENV_FILE = fileURLToPath(new URL('./fixtures/env/test.env', import.meta.url));

const WORKSPACE_SOURCE_PACKAGES = ['core', 'store', 'scanner', 'llm', 'interface', 'report'];
const packagesRoot = fileURLToPath(new URL('./packages/', import.meta.url));

const workspaceSourceAliases = [
  ...WORKSPACE_SOURCE_PACKAGES.map((name) => ({
    find: new RegExp(`^@odysseus/${name}$`),
    replacement: fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
  })),
  {
    find: new RegExp(`^@odysseus/(${WORKSPACE_SOURCE_PACKAGES.join('|')})/(.+)\\.js$`),
    replacement: `${packagesRoot}$1/src/$2.ts`,
  },
];

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
    allowOnly: false,
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
          // scripts/**/*.test.mjs: the operator scripts that touch production
          // data are tested too, not only the packages (issue #519).
          include: ['packages/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
          exclude: [...configDefaults.exclude, 'packages/**/*.e2e.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['packages/**/*.e2e.test.{ts,tsx}'],
          sequence: {
            groupOrder: 1,
          },
          maxWorkers: 4,
          retry: 1,
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
            groupOrder: 2,
          },
        },
      },
    ],
  },
});
