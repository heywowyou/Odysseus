import { describe, expect, it } from 'vitest';
import {
  hashSuppressionValue,
  normalizeAddressForHash,
  normalizeDomainForHash,
} from './suppression-hash.js';

describe('normalizeDomainForHash', () => {
  it('lowercases and strips protocol, www, path, and trailing dot', () => {
    expect(normalizeDomainForHash('HTTPS://www.Example.fr/mentions-legales')).toBe('example.fr');
    expect(normalizeDomainForHash('example.fr.')).toBe('example.fr');
  });

  it('is idempotent on an already-normalized domain', () => {
    expect(normalizeDomainForHash('example.fr')).toBe('example.fr');
  });
});

describe('normalizeAddressForHash', () => {
  it('lowercases and trims', () => {
    expect(normalizeAddressForHash('  Contact@Example.FR  ')).toBe('contact@example.fr');
  });
});

describe('hashSuppressionValue', () => {
  it('is deterministic', () => {
    expect(hashSuppressionValue('example.fr')).toBe(hashSuppressionValue('example.fr'));
  });

  it('differs for different inputs', () => {
    expect(hashSuppressionValue('example.fr')).not.toBe(hashSuppressionValue('other.fr'));
  });

  it('produces a 64-character hex sha256 digest', () => {
    expect(hashSuppressionValue('example.fr')).toMatch(/^[0-9a-f]{64}$/);
  });
});
