import { describe, expect, it } from 'vitest';
import { HOOK_FAMILIES, HOOK_FAMILY_COPY, resolveGenericDecisionQuestion } from './vocabulary.js';

describe('preparation copy tables', () => {
  it('gives every hook family French and English copy', () => {
    for (const family of HOOK_FAMILIES) {
      expect(HOOK_FAMILY_COPY[family].fr, family).toBeTruthy();
      expect(HOOK_FAMILY_COPY[family].en, family).toBeTruthy();
    }
  });

  it('keeps one canonical decision-oriented French fallback question and its English translation (issue #331)', () => {
    expect(resolveGenericDecisionQuestion('fr')).toBe(
      'Quels points de votre site faut-il corriger en priorité pour améliorer son accessibilité, sa visibilité et son utilisation\u00a0?',
    );
    expect(resolveGenericDecisionQuestion('en')).toBe(
      'Which parts of your site should be fixed as a priority to improve its accessibility, visibility, and usability?',
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
