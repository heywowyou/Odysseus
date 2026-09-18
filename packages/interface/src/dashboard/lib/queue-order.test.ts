import { describe, expect, it } from 'vitest';
import { moveInOrder } from './queue-order';

describe('moveInOrder', () => {
  it('swaps one step up or down', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('refuses a move past either end or of an unknown job', () => {
    expect(moveInOrder(['a', 'b'], 'a', 'up')).toBeUndefined();
    expect(moveInOrder(['a', 'b'], 'b', 'down')).toBeUndefined();
    expect(moveInOrder(['a', 'b'], 'z', 'up')).toBeUndefined();
  });
});
