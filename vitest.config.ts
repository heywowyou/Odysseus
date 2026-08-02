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
  test: {
    include: ['packages/**/*.{test,spec}.ts'],
    passWithNoTests: true,
    environment: 'node',
  },
});
