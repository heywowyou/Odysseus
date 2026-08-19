import { describe, expect, it } from 'vitest';
import { findRenderLintViolations } from './render-lint.js';

describe('findRenderLintViolations', () => {
  it('flags an unfilled template placeholder', () => {
    expect(findRenderLintViolations('<p>Manquant : {{percent}}%</p>').map((v) => v.label)).toContain(
      'unresolved template placeholder "{{"',
    );
  });

  it('flags the B2 shape: a sentence ending in a placeholder hyphen', () => {
    const violations = findRenderLintViolations('<p>Manquant : 100% du texte visible absent du HTML brut, sur -.</p>');
    expect(violations.map((v) => v.label)).toContain('placeholder hyphen before a sentence-ending period');
  });

  it('flags a stringified undefined/null/NaN/[object Object]', () => {
    expect(findRenderLintViolations('<p>undefined</p>').length).toBeGreaterThan(0);
    expect(findRenderLintViolations('<p>Valeur : null</p>').length).toBeGreaterThan(0);
    expect(findRenderLintViolations('<p>NaN%</p>').length).toBeGreaterThan(0);
    expect(findRenderLintViolations('<p>[object Object]</p>').length).toBeGreaterThan(0);
  });

  // report-feedback-la-corniche.md item 3.2: a real report shipped
  // "1 page(s) ont été exclues", a pluralisation placeholder left
  // unresolved rather than picking a real singular/plural form.
  it('flags an unresolved "(s)" pluralisation placeholder', () => {
    const violations = findRenderLintViolations('<p>1 page(s) ont été exclues de ce scan.</p>');
    expect(violations.map((v) => v.label)).toContain('unresolved pluralisation placeholder "(s)"');
  });

  it('finds nothing wrong with clean, complete French copy', () => {
    expect(
      findRenderLintViolations('<p>Manquant : 12% du texte visible absent du HTML brut, sur .hero-copy.</p>'),
    ).toEqual([]);
  });
});
