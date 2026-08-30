import { defineConfig } from 'vitest/config';

/**
 * One workspace-wide vitest config rather than one per package. Scanner
 * fixtures will live under each package's src, so a single include glob
 * is enough until that stops being true.
 *
 * passWithNoTests: true because Phase 1 has no scanner or crawler logic
 * yet, so the suite is intentionally empty at this point in the build.
 */
export default defineConfig({
  /** The dashboard tsconfig's react-jsx setting is invisible to esbuild
   *  (it only reads files named tsconfig.json), so rendering tests need
   *  the automatic JSX runtime spelled out here. */
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    include: ['packages/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    environment: 'node',
    globalSetup: ['./scripts/vitest-global-setup.mjs'],
  },
});
