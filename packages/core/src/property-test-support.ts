/**
 * Shared fast-check configuration for core's property tests. Not named
 * *.test.ts, so Vitest's glob does not pick this up as a suite (same trick
 * as store/src/test-support.ts).
 *
 * A fixed seed keeps the normal local/CI run fully reproducible run to run,
 * rather than exploring a different random slice of the input space every
 * time - a property that only fails on some future seed would otherwise
 * surface as unexplained CI flakiness. fast-check still prints the exact
 * seed and shrink path on any failure, fixed or not, so nothing is lost for
 * debugging: `FAST_CHECK_NUM_RUNS=5000 pnpm test <file>` runs the same
 * properties far more times locally when hunting for a rare counterexample.
 */
const PROPERTY_TEST_SEED = 20260914;

const PROPERTY_TEST_RUNS = Number(process.env.FAST_CHECK_NUM_RUNS) || 100;

export const PROPERTY_TEST_PARAMETERS = {
  seed: PROPERTY_TEST_SEED,
  numRuns: PROPERTY_TEST_RUNS,
} as const;
