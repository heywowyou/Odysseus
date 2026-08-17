import { describe, expect, it } from 'vitest';
import { detectSector } from './sector.js';

describe('detectSector', () => {
  it('classifies hébergement NAF codes as hospitality', () => {
    expect(detectSector('55.10Z')).toBe('hospitality');
  });

  it('classifies restauration NAF codes as hospitality', () => {
    expect(detectSector('56.10A')).toBe('hospitality');
  });

  it('classifies an unrelated NAF code as general', () => {
    expect(detectSector('62.01Z')).toBe('general');
  });

  it('falls back to general for an empty string', () => {
    expect(detectSector('')).toBe('general');
  });

  it('falls back to general for a malformed code with no dot', () => {
    expect(detectSector('5510Z')).toBe('general');
  });

  it('is case-insensitive', () => {
    expect(detectSector('55.10z')).toBe('hospitality');
  });

  it('trims surrounding whitespace', () => {
    expect(detectSector('  56.10A  ')).toBe('hospitality');
  });
});
