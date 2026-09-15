import { describe, expect, it } from 'vitest';
import { departmentFromPostcodeForTest } from './prospect-hub.js';

describe('prospect hub pure helpers', () => {
  it('derives metropolitan departments and Corsica from postcodes', () => {
    expect(departmentFromPostcodeForTest('92100')).toBe('92');
    expect(departmentFromPostcodeForTest('20000')).toBe('2A');
    expect(departmentFromPostcodeForTest('20200')).toBe('2B');
  });
});
