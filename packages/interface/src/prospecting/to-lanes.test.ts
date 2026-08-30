import { describe, expect, it } from 'vitest';
import { toLanes } from './to-lanes.js';

describe('toLanes', () => {
  it('distributes items round-robin, so neighbours in the input land in different lanes', () => {
    expect(toLanes(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'c', 'e'],
      ['b', 'd'],
    ]);
  });

  it('returns exactly laneCount lanes when there are more items than lanes', () => {
    const lanes = toLanes([1, 2, 3, 4, 5, 6], 3);
    expect(lanes).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it('returns empty lanes when there are fewer items than lanes', () => {
    expect(toLanes(['a'], 4)).toEqual([['a'], [], [], []]);
  });

  it('collapses a laneCount below one to a single lane instead of dropping items', () => {
    expect(toLanes(['a', 'b'], 0)).toEqual([['a', 'b']]);
    expect(toLanes(['a', 'b'], -3)).toEqual([['a', 'b']]);
  });

  it('never mutates the input list', () => {
    const items = ['a', 'b', 'c'];
    toLanes(items, 2);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
