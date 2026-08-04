import { describe, expect, it } from 'vitest';
import { findThemeKeyMismatches, isThemeKeyMismatchEmpty } from './theme-key-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function writingTheme(themeKey: string): WritingPassOutput['themes'][number] {
  return {
    themeKey,
    title: 'Title',
    businessImpact: 'Impact.',
    recommendedActions: ['Do something.'],
  };
}

describe('findThemeKeyMismatches', () => {
  it('finds no mismatch when themeKeys exactly match', () => {
    const output: WritingPassOutput = {
      themes: [writingTheme('t1'), writingTheme('t2')],
      executiveSummary: 'Summary',
      notes: '',
    };
    const mismatch = findThemeKeyMismatches(['t1', 't2'], output);
    expect(isThemeKeyMismatchEmpty(mismatch)).toBe(true);
  });

  it('flags a missing themeKey', () => {
    const output: WritingPassOutput = {
      themes: [writingTheme('t1')],
      executiveSummary: 'Summary',
      notes: '',
    };
    const mismatch = findThemeKeyMismatches(['t1', 't2'], output);
    expect(mismatch.missing).toEqual(['t2']);
    expect(isThemeKeyMismatchEmpty(mismatch)).toBe(false);
  });

  it('flags an invented extra themeKey', () => {
    const output: WritingPassOutput = {
      themes: [writingTheme('t1'), writingTheme('t99')],
      executiveSummary: 'Summary',
      notes: '',
    };
    const mismatch = findThemeKeyMismatches(['t1'], output);
    expect(mismatch.extra).toEqual(['t99']);
    expect(isThemeKeyMismatchEmpty(mismatch)).toBe(false);
  });

  it('flags a duplicated themeKey', () => {
    const output: WritingPassOutput = {
      themes: [writingTheme('t1'), writingTheme('t1')],
      executiveSummary: 'Summary',
      notes: '',
    };
    const mismatch = findThemeKeyMismatches(['t1'], output);
    expect(mismatch.duplicate).toEqual(['t1']);
    expect(isThemeKeyMismatchEmpty(mismatch)).toBe(false);
  });

  it('flags missing, extra, and duplicate together', () => {
    const output: WritingPassOutput = {
      themes: [writingTheme('t1'), writingTheme('t1'), writingTheme('t99')],
      executiveSummary: 'Summary',
      notes: '',
    };
    const mismatch = findThemeKeyMismatches(['t1', 't2'], output);
    expect(mismatch).toEqual({ missing: ['t2'], extra: ['t99'], duplicate: ['t1'] });
  });
});
