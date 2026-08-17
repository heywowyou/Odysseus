import { describe, expect, it } from 'vitest';
import type { ObligationAssessment } from '@odysseus/core';
import { renderLegalCitationParagraph, renderMethodology } from './methodology.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderMethodology against the real sas-fernande.fr manifest', () => {
  it('states the crawl size (B16) and tool versions in one merged section, no separate limitations section', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr');

    // 11 pages, docs/normalization-rules.md section 7.
    expect(html).toContain('11 pages explorées');
    expect(html).toContain(manifest.tool.axeCoreVersion ?? '');
    expect(html).toContain(manifest.tool.lighthouseVersion ?? '');
    // The automated-coverage caveat used to be duplicated across two
    // sections (B15) - now appears exactly once.
    const occurrences = html.split('30 et 40 pour cent').length - 1;
    expect(occurrences).toBe(1);
  });

  it('renders in English without leaking French', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), manifest, 'en');

    expect(html).toContain('11 pages crawled');
    expect(html).not.toContain('explorées');
  });
});

describe('renderMethodology section-number eyebrow', () => {
  it('shows "11", matching its position in the single-tier 14-section TOC (2026-08-16 redesign)', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr');
    expect(html).toContain('11 · Méthodologie et limites');
  });

  it('shows "11" in English too', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), manifest, 'en');
    expect(html).toContain('11 · Methodology and limitations');
  });
});

// B9: methodology used to render the full legal-citation paragraph a
// second time, verbatim, duplicating legal-exposure.ts's own copy of the
// same paragraph on a different page. It now renders a one-line pointer
// back to that section instead - renderLegalCitationParagraph itself, and
// its per-status branching, stays covered by legal-exposure.test.ts and
// render-html.test.ts, which exercise the function through its one
// remaining full-paragraph render site.
describe('renderMethodology legal citation pointer', () => {
  it('points back to legal exposure, and never repeats the full paragraph, when obligationAssessment is absent', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr');
    expect(html).toContain('figure dans la section');
    expect(html).not.toContain("sans se prononcer sur l&#39;applicabilité");
  });

  it('points back to legal exposure for every status, in_scope included', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = {
      status: 'in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            { kind: 'transactional-flow', evidence: [] },
          ],
        },
      ],
    };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment);
    expect(html).toContain('figure dans la section');
    // The full paragraph's regime-specific content must not be duplicated
    // here now that it renders only in legal-exposure.ts.
    expect(html).not.toContain("Obligation d&#39;accessibilité numérique");
    expect(html).not.toContain('DGCCRF');
  });

  it('renders the pointer sentence in English, not French', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), manifest, 'en');
    expect(html).toContain('Legal exposure');
    expect(html).not.toContain('figure dans la section');
  });
});

// B9: these per-status branch assertions used to run against
// renderMethodology's output before its duplicate render of this same
// paragraph was replaced with a pointer sentence above. renderMethodology
// stays the reference site for their content: they now call
// renderLegalCitationParagraph directly, the same function
// legal-exposure.ts's own render site uses.
describe('renderLegalCitationParagraph', () => {
  it('renders the pre-milestone hedge verbatim when obligationAssessment is absent', () => {
    const html = renderLegalCitationParagraph(getStrings('fr'), undefined, 'fr');
    expect(html).toContain("sans se prononcer sur l'applicabilité");
  });

  it('renders the pre-milestone hedge for status undetermined', () => {
    const assessment: ObligationAssessment = {
      status: 'undetermined',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [{ kind: 'siren-missing' }] }],
    };
    const html = renderLegalCitationParagraph(getStrings('fr'), assessment, 'fr');
    expect(html).toContain("sans se prononcer sur l'applicabilité");
  });

  it('renders the out_of_scope paragraph with no regime name or citation', () => {
    const assessment: ObligationAssessment = {
      status: 'out_of_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [{ kind: 'sme-exemption', effectifCode: '02', turnoverEur: 500_000 }],
        },
      ],
    };
    const html = renderLegalCitationParagraph(getStrings('fr'), assessment, 'fr');
    expect(html).toContain('ne relève pas de');
    expect(html).not.toContain('Loi n° 2023-171');
  });

  it('renders the in_scope paragraph naming the regime, authority, citation, and facts, with the exemption route', () => {
    const assessment: ObligationAssessment = {
      status: 'in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            { kind: 'transactional-flow', evidence: [] },
          ],
        },
      ],
    };
    const html = renderLegalCitationParagraph(getStrings('fr'), assessment, 'fr');
    expect(html).toContain("Obligation d'accessibilité numérique");
    expect(html).toContain('DGCCRF');
    // End-to-end regression: packages/interface's sirene-client.ts used to
    // hand this fact's label in without accents ("100 a 199 salaries"),
    // and that ASCII-folded string would have rendered faithfully too -
    // the bug was at the source, not in this render path. This asserts
    // both: the correct string is present, and the mangled one is not.
    expect(html).toContain('100 à 199 salariés');
    expect(html).not.toContain('100 a 199 salaries');
    expect(html).toContain('parcours transactionnel de premier niveau');
    expect(html).toContain('Démarche Simplifiée');
    expect(html).not.toContain('50 000');
  });

  it('cites article 47, not the EAA, when article 47 alone drives an in_scope result the EAA gate would not reach on its own', () => {
    const assessment: ObligationAssessment = {
      status: 'in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            { kind: 'no-transactional-flow' },
          ],
        },
        {
          regimeId: 'loi-2005-102-article-47',
          facts: [{ kind: 'turnover', amountEur: 260_000_000, thresholdEur: 250_000_000 }],
        },
      ],
    };
    const html = renderLegalCitationParagraph(getStrings('fr'), assessment, 'fr');
    expect(html).toContain('article 47');
    expect(html).not.toContain("l'European Accessibility Act");
  });

  it('renders the likely_in_scope paragraph with softened framing when the transactional flow gate is unconfirmed', () => {
    const assessment: ObligationAssessment = {
      status: 'likely_in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            { kind: 'transactional-flow-unknown' },
          ],
        },
      ],
    };
    const html = renderLegalCitationParagraph(getStrings('fr'), assessment, 'fr');
    expect(html).toContain('relève probablement de');
    expect(html).toContain("n'a pas pu être confirmée");
  });

  it('translates the effectif band label by INSEE code for an English report, not the raw French label', () => {
    const assessment: ObligationAssessment = {
      status: 'in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            { kind: 'transactional-flow', evidence: [] },
          ],
        },
      ],
    };
    const html = renderLegalCitationParagraph(getStrings('en'), assessment, 'en');
    expect(html).toContain('100 to 199 employees');
    expect(html).not.toContain('salariés');
  });
});

describe('renderMethodology siren provenance note (manual-SIREN milestone)', () => {
  const lcenFinding = { findingId: 'f023', ruleId: 'lcen-mentions-legales-missing' };
  const undeterminedAssessment: ObligationAssessment = {
    status: 'undetermined',
    basis: [{ regimeId: 'eaa-loi-2023-171', facts: [{ kind: 'siren-missing' }] }],
  };

  it('renders no note when sirenSource is extracted', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = { ...undeterminedAssessment, sirenSource: 'extracted' };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment, [lcenFinding]);
    expect(html).not.toContain('fourni manuellement');
  });

  it('renders no note when no assessment is present at all', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', undefined, [lcenFinding]);
    expect(html).not.toContain('fourni manuellement');
  });

  it('links to the LCEN finding when sirenSource is manual and a matching finding exists', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = { ...undeterminedAssessment, sirenSource: 'manual' };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment, [lcenFinding]);
    expect(html).toContain('fourni manuellement');
    expect(html).toContain('f023');
  });

  it('falls back to a finding-less sentence when sirenSource is manual but no LCEN finding exists', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = { ...undeterminedAssessment, sirenSource: 'manual' };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment, []);
    expect(html).toContain('fourni manuellement');
    expect(html).not.toContain('voir constat');
  });

  it('renders the mismatch note with both numbers when sirenMismatch is present', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = {
      ...undeterminedAssessment,
      sirenSource: 'manual',
      sirenMismatch: { extractedSiren: '732829320', manualSiren: '552032534' },
    };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment, [lcenFinding]);
    expect(html).toContain('552032534');
    expect(html).toContain('732829320');
    // Mismatch note takes precedence over the manual-only note - they
    // never both render.
    expect(html).not.toContain('fourni manuellement,');
  });

  it('renders the mismatch note in English with the same two numbers', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = {
      ...undeterminedAssessment,
      sirenSource: 'manual',
      sirenMismatch: { extractedSiren: '732829320', manualSiren: '552032534' },
    };
    const html = renderMethodology(getStrings('en'), manifest, 'en', assessment, [lcenFinding]);
    expect(html).toContain('552032534');
    expect(html).toContain('732829320');
    expect(html).toContain('differs from');
  });
});

/** Milestone: the report must never disclose whether a given input
 *  (transactional-flow status, in particular) was detected automatically
 *  or confirmed manually by the auditor. The override still resolves
 *  siteSignals exactly as before (packages/interface's obligation-stage.ts
 *  resolveSiteSignals()) and a detector disagreement is still logged
 *  internally there; only the client-facing PDF text was removed. */
describe('renderMethodology never discloses manual vs automated resolution of a site signal', () => {
  const inScopeAssessment: ObligationAssessment = {
    status: 'in_scope',
    basis: [
      {
        regimeId: 'eaa-loi-2023-171',
        facts: [
          { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
          { kind: 'transactional-flow', evidence: [] },
        ],
      },
    ],
  };

  const bannedPhrases = ['confirmée manuellement', 'confirmed manually', 'auditeur', 'auditor', 'diverge du résultat', 'disagrees with the result'];

  it('never mentions manual confirmation or auditor override when the resolution source is manual, with a disagreement', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = {
      ...inScopeAssessment,
      siteSignalResolutions: {
        hasTransactionalFlow: {
          value: true,
          source: 'manual',
          reason: 'redirige vers un moteur de réservation dédié',
          detectedValue: false,
        },
      },
    };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment);
    for (const phrase of bannedPhrases) {
      expect(html).not.toContain(phrase);
    }
  });

  it('never mentions manual confirmation or auditor override in English either', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = {
      ...inScopeAssessment,
      siteSignalResolutions: { hasTransactionalFlow: { value: true, source: 'manual' } },
    };
    const html = renderMethodology(getStrings('en'), manifest, 'en', assessment);
    for (const phrase of bannedPhrases) {
      expect(html).not.toContain(phrase);
    }
  });

  it('renders identically to the detected-source case, since the note no longer exists', async () => {
    const manifest = await loadSasFernandeManifest();
    const detected: ObligationAssessment = {
      ...inScopeAssessment,
      siteSignalResolutions: { hasTransactionalFlow: { value: true, source: 'detected' } },
    };
    const manual: ObligationAssessment = {
      ...inScopeAssessment,
      siteSignalResolutions: { hasTransactionalFlow: { value: true, source: 'manual' } },
    };
    const htmlDetected = renderMethodology(getStrings('fr'), manifest, 'fr', detected);
    const htmlManual = renderMethodology(getStrings('fr'), manifest, 'fr', manual);
    expect(htmlManual).toBe(htmlDetected);
  });
});
