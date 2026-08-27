import { describe, it, expect } from 'vitest';
import { OVERPASS_YIELD_FLOOR, decideOverpassNeed } from './overpass-decision.js';

describe('decideOverpassNeed', () => {
  it('defers at exactly the floor, since the target range includes its lower bound', () => {
    expect(decideOverpassNeed(OVERPASS_YIELD_FLOOR)).toBe('defer');
  });

  it.each([
    [7_998, 'propose'],
    [7_999, 'propose'],
    [8_000, 'defer'],
    [8_001, 'defer'],
  ] as const)('decides %i as %s', (yieldCount, decision) => {
    expect(decideOverpassNeed(yieldCount)).toBe(decision);
  });

  it('proposes on a zero yield rather than treating it as a special case', () => {
    expect(decideOverpassNeed(0)).toBe('propose');
  });

  it('keeps the floor at the documented lower bound of the target range', () => {
    expect(OVERPASS_YIELD_FLOOR).toBe(8_000);
  });
});
