/**
 * Keys provided by scripts/vitest-e2e-global-setup.mjs to every e2e test
 * worker. Kept beside the suites that consume them so `inject()` typechecks
 * without repeating the augmentation in each file. The side-effect import
 * makes this file a module, so the block below augments the real 'vitest'
 * types instead of shadowing them with an ambient declaration.
 */
import 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    /** Origin of the shared fixtures/spa-demo dev server started once per
     *  e2e run by the global setup script. */
    spaDemoOrigin: string;
  }
}
