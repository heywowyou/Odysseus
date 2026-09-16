import { describe, expect, it } from 'vitest';
import { HOOK_FAMILIES, HOOK_FAMILY_COPY, resolveGenericDecisionQuestion } from './vocabulary.js';

describe('preparation copy tables', () => {
  it('gives every hook family French and English copy', () => {
    for (const family of HOOK_FAMILIES) {
      expect(HOOK_FAMILY_COPY[family].fr, family).toBeTruthy();
      expect(HOOK_FAMILY_COPY[family].en, family).toBeTruthy();
    }
  });

  it('keeps one canonical decision-oriented French fallback question', () => {
    expect(resolveGenericDecisionQuestion('fr')).toBe(
      'Quels points de votre site faut-il corriger en priorité pour améliorer son accessibilité, sa visibilité et son utilisation ?',
    );
    expect(resolveGenericDecisionQuestion('en')).toBe(
      'What is the current state of your site, and where should you start?',
    );
  });

  it('keeps product copy free of em and en dashes', () => {
    const allStrings: string[] = HOOK_FAMILIES.flatMap((value) =>
      Object.values(HOOK_FAMILY_COPY[value]),
    );
    for (const value of allStrings) {
      expect(value.includes('\u2014') || value.includes('\u2013'), value).toBe(false);
    }
  });
});
