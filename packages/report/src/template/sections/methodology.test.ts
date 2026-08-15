import { describe, expect, it } from 'vitest';
import type { ObligationAssessment } from '@odysseus/core';
import { renderMethodology } from './methodology.js';
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

describe('renderMethodology section-number eyebrow, tier-aware', () => {
  it('shows "9" for the full tier (default), matching its position in the full 9-section TOC', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr');
    expect(html).toContain('9 · Méthodologie et limites');
  });

  it('shows "5" for the screening tier, matching its position in the 5-section screening TOC, not "9"', async () => {
    // Real bug found 2026-08-10 reviewing a live haaitza.com screening
    // report: this eyebrow hardcoded "9" (the full tier's position) even
    // in the 5-section screening tier, jumping from section 4 to 9.
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', undefined, [], 'screening');
    expect(html).toContain('5 · Méthodologie et limites');
    expect(html).not.toContain('9 · Méthodologie et limites');
  });

  it('shows "5" for the screening tier in English too', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), manifest, 'en', undefined, [], 'screening');
    expect(html).toContain('5 · Methodology and limitations');
    expect(html).not.toContain('9 · Methodology and limitations');
  });
});

describe('renderMethodology legal citation branch', () => {
  it('renders the pre-milestone hedge verbatim when obligationAssessment is absent', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr');
    expect(html).toContain("sans se prononcer sur l&#39;applicabilité");
  });

  it('renders the pre-milestone hedge for status undetermined', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = {
      status: 'undetermined',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [{ kind: 'siren-missing' }] }],
    };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment);
    expect(html).toContain("sans se prononcer sur l&#39;applicabilité");
  });

  it('renders the out_of_scope paragraph with no regime name or citation', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = {
      status: 'out_of_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [{ kind: 'sme-exemption', effectifCode: '02', turnoverEur: 500_000 }],
        },
      ],
    };
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment);
    expect(html).toContain('ne relève pas de');
    expect(html).not.toContain('Loi n° 2023-171');
  });

  it('renders the in_scope paragraph naming the regime, authority, citation, and facts, with the exemption route', async () => {
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
    expect(html).toContain("Obligation d&#39;accessibilité numérique");
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

  it('cites article 47, not the EAA, when article 47 alone drives an in_scope result the EAA gate would not reach on its own', async () => {
    const manifest = await loadSasFernandeManifest();
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
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment);
    expect(html).toContain('article 47');
    expect(html).not.toContain("l'European Accessibility Act");
  });

  it('renders the likely_in_scope paragraph with softened framing when the transactional flow gate is unconfirmed', async () => {
    const manifest = await loadSasFernandeManifest();
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
    const html = renderMethodology(getStrings('fr'), manifest, 'fr', assessment);
    expect(html).toContain('relève probablement de');
    expect(html).toContain("n&#39;a pas pu être confirmée");
  });

  it('translates the effectif band label by INSEE code for an English report, not the raw French label', async () => {
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
    const html = renderMethodology(getStrings('en'), manifest, 'en', assessment);
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
