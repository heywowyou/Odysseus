import { describe, expect, it } from 'vitest';
import { buildLegalRelevance, getCriterionName } from './legal-relevance.js';

describe('getCriterionName', () => {
  it('returns the official name for a mapped criterion, in the requested language', () => {
    expect(getCriterionName('1.4.3', 'fr')).toBe('Contraste minimum');
    expect(getCriterionName('1.4.3', 'en')).toBe('Contrast (Minimum)');
  });

  it('returns undefined, never a guess, for an unmapped criterion', () => {
    expect(getCriterionName('9.9.9', 'fr')).toBeUndefined();
  });
});

describe('buildLegalRelevance', () => {
  // Exact strings verified in docs/report-v2-prototype-haaitza-fr.html
  // against the real haaitza.com scan - the acceptance test for this
  // function per docs/archive/report-v2-refactor.md 4.3.
  it('reproduces the prototype single-criterion sentences verbatim, French', () => {
    expect(buildLegalRelevance(['1.4.4'], 'fr')).toBe(
      'Critère 1.4.4 (Redimensionnement du texte), WCAG 2.2 niveau AA, référencé par la norme EN 301 549.',
    );
    expect(buildLegalRelevance(['1.1.1'], 'fr')).toBe(
      'Critère 1.1.1 (Contenu non textuel), WCAG 2.2 niveau AA, référencé par la norme EN 301 549.',
    );
    expect(buildLegalRelevance(['2.5.8'], 'fr')).toBe(
      'Critère 2.5.8 (Taille de la cible, minimum), WCAG 2.2 niveau AA, référencé par la norme EN 301 549.',
    );
    expect(buildLegalRelevance(['4.1.2'], 'fr')).toBe(
      'Critère 4.1.2 (Nom, rôle et valeur), WCAG 2.2 niveau AA, référencé par la norme EN 301 549.',
    );
  });

  it('reproduces the prototype multi-criterion sentences verbatim, French', () => {
    expect(buildLegalRelevance(['2.4.4', '4.1.2'], 'fr')).toBe(
      'Critères 2.4.4 (Fonction du lien selon le contexte) et 4.1.2 (Nom, rôle et valeur), WCAG 2.2 niveau AA, référencés par la norme EN 301 549.',
    );
    expect(buildLegalRelevance(['1.4.1', '1.4.3'], 'fr')).toBe(
      'Critères 1.4.1 (Utilisation de la couleur) et 1.4.3 (Contraste minimum), WCAG 2.2 niveau AA, référencés par la norme EN 301 549.',
    );
  });

  it('sorts unordered input by criterion number before joining', () => {
    expect(buildLegalRelevance(['4.1.2', '2.4.4'], 'fr')).toBe(
      buildLegalRelevance(['2.4.4', '4.1.2'], 'fr'),
    );
  });

  it('dedupes a repeated criterion', () => {
    expect(buildLegalRelevance(['1.4.3', '1.4.3'], 'fr')).toBe(
      buildLegalRelevance(['1.4.3'], 'fr'),
    );
  });

  it('joins three or more criteria with a final conjunction, not a bare comma list', () => {
    const result = buildLegalRelevance(['1.1.1', '1.4.3', '4.1.2'], 'fr');
    expect(result).toBe(
      'Critères 1.1.1 (Contenu non textuel), 1.4.3 (Contraste minimum) et 4.1.2 (Nom, rôle et valeur), WCAG 2.2 niveau AA, référencés par la norme EN 301 549.',
    );
  });

  it('falls back to the bare code, never an invented name, for an unmapped criterion', () => {
    expect(buildLegalRelevance(['9.9.9'], 'fr')).toBe(
      'Critère 9.9.9, WCAG 2.2 niveau AA, référencé par la norme EN 301 549.',
    );
  });

  it('produces an English sentence in the same fixed shape', () => {
    expect(buildLegalRelevance(['1.4.3'], 'en')).toBe(
      'Criterion 1.4.3 (Contrast (Minimum)), WCAG 2.2 level AA, referenced by the EN 301 549 standard.',
    );
    expect(buildLegalRelevance(['2.4.4', '4.1.2'], 'en')).toBe(
      'Criteria 2.4.4 (Link Purpose (In Context)) and 4.1.2 (Name, Role, Value), WCAG 2.2 level AA, referenced by the EN 301 549 standard.',
    );
  });

  it('returns an empty string for an empty criteria list', () => {
    expect(buildLegalRelevance([], 'fr')).toBe('');
  });

  // Issue #81: a real La Corniche report listed 2.1.3 (level AAA, tagged
  // by axe onto scrollable-region-focusable) in a sentence that itself
  // says "WCAG 2.2 niveau AA", with a blank name cell since
  // WCAG_CRITERION_NAMES is deliberately scoped to A/AA. The AAA filter
  // (isAuditedConformanceLevel) used to be applied only in
  // conformance-rollup.ts; this is the second call site it never reached.
  it('drops a level AAA criterion rather than rendering it nameless', () => {
    expect(buildLegalRelevance(['2.1.1', '2.1.3', '2.4.4'], 'fr')).toBe(
      buildLegalRelevance(['2.1.1', '2.4.4'], 'fr'),
    );
    expect(buildLegalRelevance(['2.1.3'], 'fr')).toBe('');
    expect(buildLegalRelevance(['2.1.3'], 'en')).toBe('');
  });
});
