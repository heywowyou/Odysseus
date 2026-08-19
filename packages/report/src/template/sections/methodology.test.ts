import { describe, expect, it } from 'vitest';
import type { ObligationAssessment } from '@odysseus/core';
import { renderLegalCitationParagraph, renderMethodology } from './methodology.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderMethodology against the real sas-fernande.fr manifest', () => {
  it('states the crawl size (B16) and tool versions in one merged section, no separate limitations section', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr');

    // 11 pages, docs/normalization-rules.md section 7. item 3.6: "pages
    // analysées" is the standardized term everywhere ("scannées" on the
    // cover and "explorées" here used to disagree with the stats page).
    expect(html).toContain('11 pages analysées');
    expect(html).toContain(manifest.tool.axeCoreVersion ?? '');
    expect(html).toContain(manifest.tool.lighthouseVersion ?? '');
    // The automated-coverage caveat used to be duplicated across two
    // sections (B15) - now appears exactly once.
    const occurrences = html.split('30 et 40 pour cent').length - 1;
    expect(occurrences).toBe(1);
  });

  it('renders in English without leaking French', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), 11, manifest, 'en');

    expect(html).toContain('11 pages analyzed');
    expect(html).not.toContain('explorées');
  });
});

// report-feedback-la-corniche.md item 3.2: the social-exclusion count
// used to render "1 page(s) ont été exclues" verbatim for a count of 1 -
// a literal, unresolved pluralisation placeholder shipped to a client.
describe('item 3.2: the social-exclusion disclosure agrees with a singular count', () => {
  it('uses the singular sentence for exactly one excluded page', async () => {
    const manifest = await loadSasFernandeManifest();
    const withOneExcluded = {
      ...manifest,
      pages: [...manifest.pages, { url: 'https://example.com/social/facebook/', depth: 1, status: 'skipped-external-redirect' as const, errors: {} }],
    };
    const html = renderMethodology(getStrings('fr'), 11, withOneExcluded, 'fr');

    expect(html).toContain('1 page a été exclue de ce scan');
    expect(html).not.toContain('page(s)');
  });

  it('uses the plural sentence for more than one excluded page', async () => {
    const manifest = await loadSasFernandeManifest();
    const withTwoExcluded = {
      ...manifest,
      pages: [
        ...manifest.pages,
        { url: 'https://example.com/social/facebook/', depth: 1, status: 'skipped-external-redirect' as const, errors: {} },
        { url: 'https://example.com/social/instagram/', depth: 1, status: 'skipped-external-redirect' as const, errors: {} },
      ],
    };
    const html = renderMethodology(getStrings('fr'), 11, withTwoExcluded, 'fr');

    expect(html).toContain('2 pages ont été exclues de ce scan');
    expect(html).not.toContain('page(s)');
  });
});

describe('renderMethodology section-number eyebrow', () => {
  it('shows "11", matching its position in the single-tier 14-section TOC (2026-08-16 redesign)', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr');
    expect(html).toContain('11 · Méthodologie et limites');
  });

  it('shows "11" in English too', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), 11, manifest, 'en');
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
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr');
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
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', assessment);
    expect(html).toContain('figure dans la section');
    // The full paragraph's regime-specific content must not be duplicated
    // here now that it renders only in legal-exposure.ts.
    expect(html).not.toContain("Obligation d&#39;accessibilité numérique");
    expect(html).not.toContain('DGCCRF');
  });

  it('renders the pointer sentence in English, not French', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), 11, manifest, 'en');
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
    // item 41: no more "de premier niveau" jargon, and no "ou" listing
    // all three flow types when detection can't narrow it further (this
    // fixture's evidence array is empty).
    expect(html).toContain('parcours de réservation, panier ou paiement directement en ligne');
    expect(html).not.toContain('premier niveau');
    // item 3.15: "Démarche Simplifiée" (singular) was wrong - the
    // platform's real name is plural.
    expect(html).toContain('Démarches Simplifiées');
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

  // item 3.15: "sous le contrôle de Direction générale..." was missing
  // "la" - the authority string is a single canonical value shared with
  // English (regimes.ts's own convention), so the fix prepends "de la"/
  // "du" at fill time, per regime, in French only. Two regimes use two
  // different authorities with different grammatical gender ("de la
  // Direction générale..." vs "du Défenseur des droits" - "de le" is not
  // valid French), so both must be checked, not just one.
  describe('item 3.15: the authority is grammatically correct in French for every regime', () => {
    it('DGCCRF (EAA route): "sous le contrôle de la Direction générale"', () => {
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
      expect(html).toContain('sous le contrôle de la Direction générale');
      expect(html).not.toContain('sous le contrôle de Direction générale');
    });

    it('Défenseur des droits (article 47 route): "sous le contrôle du Défenseur des droits"', () => {
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
      expect(html).toContain('sous le contrôle du Défenseur des droits');
      expect(html).not.toContain('sous le contrôle de Défenseur des droits');
      expect(html).not.toContain('sous le contrôle de le Défenseur');
    });

    it('never prepends a French article/preposition in an English report', () => {
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
      expect(html).toContain('overseen by Direction générale');
      expect(html).not.toContain('overseen by de la');
    });
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

  // item 41: names the specific detected flow type instead of listing all
  // three possibilities with "ou".
  it('names "réservation" specifically when only booking evidence was found', () => {
    const assessment: ObligationAssessment = {
      status: 'in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            {
              kind: 'transactional-flow',
              evidence: [{ kind: 'booking-engine-script', selector: 'script', pageUrl: 'https://example.com/', detail: 'simplebooking' }],
            },
          ],
        },
      ],
    };
    const html = renderLegalCitationParagraph(getStrings('fr'), assessment, 'fr');
    expect(html).toContain('parcours de réservation directement en ligne');
    expect(html).not.toContain(' ou ');
  });

  it('names "panier ou de paiement" specifically when only checkout evidence was found', () => {
    const assessment: ObligationAssessment = {
      status: 'in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            {
              kind: 'transactional-flow',
              evidence: [{ kind: 'checkout-form', selector: 'form', pageUrl: 'https://example.com/', detail: 'action=/panier' }],
            },
          ],
        },
      ],
    };
    const html = renderLegalCitationParagraph(getStrings('fr'), assessment, 'fr');
    expect(html).toContain('parcours de panier ou de paiement directement en ligne');
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
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', assessment, [lcenFinding]);
    expect(html).not.toContain('fourni manuellement');
  });

  it('renders no note when no assessment is present at all', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', undefined, [lcenFinding]);
    expect(html).not.toContain('fourni manuellement');
  });

  it('links to the LCEN finding when sirenSource is manual and a matching finding exists', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = { ...undeterminedAssessment, sirenSource: 'manual' };
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', assessment, [lcenFinding]);
    expect(html).toContain('fourni manuellement');
    expect(html).toContain('f023');
  });

  it('falls back to a finding-less sentence when sirenSource is manual but no LCEN finding exists', async () => {
    const manifest = await loadSasFernandeManifest();
    const assessment: ObligationAssessment = { ...undeterminedAssessment, sirenSource: 'manual' };
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', assessment, []);
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
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', assessment, [lcenFinding]);
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
    const html = renderMethodology(getStrings('en'), 11, manifest, 'en', assessment, [lcenFinding]);
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
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', assessment);
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
    const html = renderMethodology(getStrings('en'), 11, manifest, 'en', assessment);
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
    const htmlDetected = renderMethodology(getStrings('fr'), 11, manifest, 'fr', detected);
    const htmlManual = renderMethodology(getStrings('fr'), 11, manifest, 'fr', manual);
    expect(htmlManual).toBe(htmlDetected);
  });
});

describe('item 1.10/B8: the extended accessibility pass states its own result', () => {
  it('renders the "none found" note when no finding uses any of the four extended-pass rule ids', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', undefined, []);
    expect(html).toContain("Résultat de la passe d&#39;accessibilité étendue");
  });

  // item 1.7 (La Corniche pass): the note used to be entirely suppressed
  // when any one of the four checks found something, so a real report
  // with only a video-captions finding said nothing at all about the
  // other three checks (keyboard traps, focus order, form errors), which
  // had genuinely found nothing. States each check individually instead.
  it('states each check individually, clean or with its own count, once at least one check found something', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', undefined, [
      { findingId: 'f1', ruleId: 'video-missing-captions' },
      { findingId: 'f2', ruleId: 'video-missing-captions' },
    ]);
    expect(html).toContain('Résultat de la passe d&#39;accessibilité étendue');
    expect(html).toContain('pièges au clavier (aucune anomalie détectée)');
    expect(html).toContain('ordre de focus (aucune anomalie détectée)');
    expect(html).toContain('erreurs de formulaire non associées à leur champ (aucune anomalie détectée)');
    expect(html).toContain('sous-titres vidéo (2 constats détectés)');
  });

  it('ignores the alt-text heuristic rule id, which has its own separate block', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr', undefined, [
      { findingId: 'f1', ruleId: 'alt-text-quality-heuristic' },
    ]);
    expect(html).toContain("Résultat de la passe d&#39;accessibilité étendue");
  });
});

// item 3.11: "20 pages" appeared everywhere with nothing stating it is a
// configured cap, not the whole site - a client could reasonably believe
// the entire site was covered.
describe('item 3.11: the crawl cap is explained when it actually bound', () => {
  it('states the cap when the crawl visited exactly the configured max', async () => {
    const manifest = await loadSasFernandeManifest();
    const capped = { ...manifest, crawl: { ...manifest.crawl, visitedCount: 20, maxPages: 20 } };
    const html = renderMethodology(getStrings('fr'), 11, capped, 'fr');
    expect(html).toContain('20 pages est un plafond configuré');
  });

  it('says nothing about the cap when the whole site is smaller than it', async () => {
    const manifest = await loadSasFernandeManifest();
    const uncapped = { ...manifest, crawl: { ...manifest.crawl, visitedCount: 11, maxPages: 20 } };
    const html = renderMethodology(getStrings('fr'), 11, uncapped, 'fr');
    expect(html).not.toContain('plafond configuré');
  });
});
