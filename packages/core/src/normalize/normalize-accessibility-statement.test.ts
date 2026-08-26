import { describe, expect, it } from 'vitest';
import { normalizeAccessibilityStatement } from './normalize-accessibility-statement.js';

const HOMEPAGE = 'https://x.fr/';

describe('normalizeAccessibilityStatement', () => {
  it('emits a finding when no statement was found', () => {
    const candidates = normalizeAccessibilityStatement(
      { statementUrl: null, pagesSearched: 23 },
      HOMEPAGE,
    );
    expect(candidates.map((c) => c.ruleId)).toEqual(['accessibility-statement-missing']);
    expect(candidates[0]!.category).toBe('accessibility');
    expect(candidates[0]!.pageUrl).toBe(HOMEPAGE);
  });

  it('emits nothing when a statement was found, and no "pass" either', () => {
    expect(
      normalizeAccessibilityStatement(
        { statementUrl: 'https://x.fr/accessibilite', pagesSearched: 23 },
        HOMEPAGE,
      ),
    ).toEqual([]);
  });

  it('carries no WCAG criterion: publishing a statement is not a success criterion', () => {
    expect(
      normalizeAccessibilityStatement({ statementUrl: null, pagesSearched: 5 }, HOMEPAGE)[0]!
        .wcagCriteria,
    ).toEqual([]);
  });

  it('scopes "not found" to the pages actually analysed, never to the whole site', () => {
    const description = normalizeAccessibilityStatement(
      { statementUrl: null, pagesSearched: 23 },
      HOMEPAGE,
    )[0]!.description;
    expect(description).toContain('23');
    expect(description).toContain("outside this audit's scope");
  });

  it('never states that the obligation applies to this business', () => {
    const text = normalizeAccessibilityStatement({ statementUrl: null, pagesSearched: 5 }, HOMEPAGE)
      .map((c) => `${c.title} ${c.description}`)
      .join(' ')
      .toLowerCase();
    for (const forbidden of [
      'you must',
      'in breach',
      'illegal',
      'your business is required',
      'you are required',
    ]) {
      expect(text, `asserts a legal conclusion: "${forbidden}"`).not.toContain(forbidden);
    }
  });
});
