import { describe, expect, it } from 'vitest';
import { readinessOutcome } from './page-readiness.js';

describe('readinessOutcome', () => {
  it('is ready only when the DOM, network and mutations all settled', () => {
    expect(readinessOutcome({ domReady: true, networkQuiet: true, mutationQuiescent: true })).toBe(
      'ready',
    );
  });

  it.each([
    { domReady: false, networkQuiet: true, mutationQuiescent: true },
    { domReady: true, networkQuiet: false, mutationQuiescent: true },
    { domReady: true, networkQuiet: true, mutationQuiescent: false },
  ])('is unstable when any settle signal is missing: %o', (signals) => {
    expect(readinessOutcome(signals)).toBe('unstable');
  });
});
