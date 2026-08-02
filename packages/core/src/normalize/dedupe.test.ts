import { describe, expect, it } from 'vitest';
import { computeDedupeKey } from './dedupe.js';

describe('computeDedupeKey', () => {
  it('is deterministic for the same inputs', () => {
    const a = computeDedupeKey('axe', 'color-contrast', '#footer a');
    const b = computeDedupeKey('axe', 'color-contrast', '#footer a');
    expect(a).toBe(b);
  });

  it('is 16 hex characters', () => {
    const key = computeDedupeKey('axe', 'color-contrast', '#footer a');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs when source differs', () => {
    const a = computeDedupeKey('axe', 'color-contrast', '');
    const b = computeDedupeKey('lighthouse', 'color-contrast', '');
    expect(a).not.toBe(b);
  });

  it('differs when ruleId differs', () => {
    const a = computeDedupeKey('axe', 'color-contrast', '');
    const b = computeDedupeKey('axe', 'image-alt', '');
    expect(a).not.toBe(b);
  });

  it('differs when selector differs, even by whitespace', () => {
    const a = computeDedupeKey('axe', 'color-contrast', '#footer a');
    const b = computeDedupeKey('axe', 'color-contrast', '#footer  a');
    expect(a).not.toBe(b);
  });

  it('treats the empty selector as a distinct, valid page-scoped key', () => {
    const a = computeDedupeKey('renderdiff', 'text-missing-from-raw-html', '');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});
