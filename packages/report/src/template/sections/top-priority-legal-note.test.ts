/**
 * A7b (2026-08-24). The note under priority 1 asserted that the top
 * priority "est un enjeu commercial, pas un enjeu de conformité légale"
 * whenever the theme carried no `legalRelevance`. But legalRelevance is
 * built only for accessibility themes with WCAG criteria
 * (packages/llm/src/legal-relevance.ts), so the note was making a claim
 * about privacy, LCEN and security themes it knows nothing about - in a
 * real Palais Gallien report, on the same document as a section 03 LCEN
 * breach.
 *
 * This file exists because nothing asserted the copy before: the French
 * rewording silently no-op'd once during this session (a string replace
 * whose match text was stale) and reached a regenerated PDF unchanged,
 * caught only by reading the output. A test on the assertion itself, not
 * only on when the note renders, is what makes that visible.
 */
import { describe, expect, it } from 'vitest';
import { getStrings } from '../strings/i18n.js';

const languages = ['fr', 'en'] as const;

describe('the top-priority note claims only what legalRelevance actually knows', () => {
  for (const language of languages) {
    const e = getStrings(language).executiveSummary;
    const notes = [e.topPriorityIsNotLegalWithPointerTemplate, e.topPriorityIsNotLegalNoPointer];

    it(`[${language}] never claims the priority is not a legal matter at all`, () => {
      for (const note of notes) {
        expect(note).not.toMatch(/pas un enjeu de conformité légale/);
        expect(note).not.toMatch(/not a legal conformance issue/);
        expect(note).not.toMatch(/liée à la conformité légale/);
        expect(note).not.toMatch(/tied to legal conformance/);
      }
    });

    it(`[${language}] scopes the claim to accessibility criteria`, () => {
      for (const note of notes) {
        expect(note).toMatch(language === 'fr' ? /critère d'accessibilité/ : /accessibility criterion/);
      }
    });

    it(`[${language}] tells the reader other obligations may apply separately`, () => {
      for (const note of notes) {
        expect(note).toMatch(
          language === 'fr' ? /autres obligations/i : /other obligations/i,
        );
      }
    });

    it(`[${language}] keeps the {legalRank} placeholder only on the pointer variant`, () => {
      expect(e.topPriorityIsNotLegalWithPointerTemplate).toContain('{legalRank}');
      expect(e.topPriorityIsNotLegalNoPointer).not.toContain('{legalRank}');
    });
  }
});
