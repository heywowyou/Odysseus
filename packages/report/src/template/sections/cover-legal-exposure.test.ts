/**
 * B7 regression: the cover risk badge must never read as a legal
 * conclusion, and an 'undetermined' obligation status must always carry
 * a resolving action rather than leaving the client with nothing to do.
 */
import { describe, expect, it } from 'vitest';
import type { AuditManifest, ObligationAssessment } from '@odysseus/core';
import { renderCover } from './cover.js';
import { renderLegalExposure } from './legal-exposure.js';
import { fr } from '../strings/fr.js';
import { en } from '../strings/en.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';

/** Minimal manifest for tests that don't care about SIREN/date specifics
 *  (item 24's own describe block below builds its own with a real siren). */
function fakeManifest(overrides: Partial<AuditManifest> = {}): AuditManifest {
  return {
    auditId: 'a1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-17T00:00:00.000Z',
    finishedAt: '2026-08-17T00:05:00.000Z',
    tool: {} as AuditManifest['tool'],
    config: {} as AuditManifest['config'],
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 3,
      robotsTxtFound: false,
      effectiveDelayMs: 500,
    },
    pages: [],
    ...overrides,
  };
}

describe('B7: cover badge never contradicts an undetermined obligation status', () => {
  it('the fr cover badge label contains no legal-risk wording', () => {
    expect(fr.cover.riskSmallLabel.toLowerCase()).not.toContain('risque');
  });

  it('the en cover badge label contains no legal-risk wording', () => {
    expect(en.cover.riskSmallLabel.toLowerCase()).not.toContain('risk');
  });

  it('renders the same risk value/colour regardless of the relabel', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, { ...analysis, overallRisk: 'high' });
    expect(html).toContain(fr.cover.riskLevels.high);
  });
});

// item 42: the risk badge showed no scale and no stated basis for how it
// was derived - the reader had no way to calibrate "Élevé" or verify how
// the tool got there.
describe('item 42: the cover risk badge shows its scale and its basis', () => {
  it('shows all three scale labels (Faible/Moyen/Élevé), not just the current level', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, { ...analysis, overallRisk: 'high' });
    expect(html).toContain('Faible');
    expect(html).toContain('Moyen');
    expect(html).toContain('Élevé');
  });

  it('states the critical/serious counts the badge is based on', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, { ...analysis, overallRisk: 'high' }, findings);
    expect(html).toContain('Basé sur');
    expect(html).toMatch(/Basé sur \d+ constats critiques et \d+ constats sérieux/);
  });

  it('renders the undetermined action note when status is undetermined', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      { status: 'undetermined', basis: [] },
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).toContain('publié sur le site ou communiqué');
  });

  it('does not render the action note for a determined status', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      { status: 'out_of_scope', basis: [] },
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain(fr.legalExposure.undeterminedActionNote);
  });

  it('renders the action note when obligationAssessment is absent entirely', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      undefined,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).toContain('publié sur le site ou communiqué');
  });
});

// item 17: "Échéance EAA" (deadline, implying upcoming) read as the
// weakest possible framing of the strongest fact in the document, in a
// report generated fourteen months after the date it names. Relabeled to
// "in application since", with an elapsed-duration note computed from the
// report's own generation date rather than hardcoded.
describe('item 17: the EAA date reads as already in force, with a computed elapsed duration', () => {
  it('the label no longer reads as an upcoming deadline', () => {
    expect(fr.legalExposure.eaaDeadlineLabel.toLowerCase()).not.toContain('échéance');
    expect(en.legalExposure.eaaDeadlineLabel.toLowerCase()).not.toContain('deadline');
  });

  it('states the elapsed duration in years for a report generated 14 months later, matching the reported case', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      undefined,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).toContain('plus d&#39;un an');
  });

  it('states the elapsed duration in months for a report generated shortly after the date', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      undefined,
      new Date('2025-09-28'),
      fakeManifest(),
      [],
    );
    expect(html).toContain('3 mois');
  });

  it('renders the duration in English for an English report', () => {
    const html = renderLegalExposure(
      en,
      2,
      'en',
      undefined,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).toContain('more than a year');
  });
});

describe('RF-03: client-specific EAA sanctions are never rendered', () => {
  const eaaInScope: import('@odysseus/core').ObligationAssessment = {
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

  it('does not state sanction amounts for an EAA assessment', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      eaaInScope,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('7 500');
    expect(html).not.toContain('50 000');
  });

  // Revised 2026-08-18 (B9/item 1.14): the Lille/Caen case-law sentence
  // was removed from client-facing output. Its source in
  // docs/rules/obligation-basis.md is tagged Status: secondary ("internal use
  // only"), sourced from press summaries rather than the ordonnances
  // themselves, so it was never eligible to reach a client under the
  // doc's own primary-only rule despite having shipped here.
  it('never states the Lille/Caen case-law outcome, which is sourced from status-secondary material', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      eaaInScope,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('Lille');
    expect(html).not.toContain('Caen');
  });

  it('renders nothing for an out_of_scope status', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      { status: 'out_of_scope', basis: [] },
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('7 500');
  });

  it('renders nothing for an undetermined status', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      undefined,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('7 500');
  });

  it('renders nothing when article 47, not EAA, is the resolved regime', () => {
    const article47InScope: import('@odysseus/core').ObligationAssessment = {
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
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      article47InScope,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('7 500');
  });
});

describe('RF-03: every assessment state is presented as observed inputs', () => {
  const assessments: ObligationAssessment[] = [
    {
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
    },
    {
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
    },
    {
      status: 'out_of_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [{ kind: 'sme-exemption', effectifCode: '02', turnoverEur: 500_000 }],
        },
      ],
    },
    {
      status: 'undetermined',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [{ kind: 'siren-missing' }] }],
    },
  ];

  it.each([
    ['fr', fr],
    ['en', en],
  ] as const)(
    'contains no prohibited conclusion or filing instruction in %s',
    (language, strings) => {
      for (const assessment of assessments) {
        const html = renderLegalExposure(
          strings,
          2,
          language,
          assessment,
          new Date('2026-08-17'),
          fakeManifest(),
          [],
        );
        expect(html).not.toMatch(
          /Critères réunis|Criteria met|Hors champ|Out of scope|remplit les critères|meets the criteria|relève probablement|likely falls|does not fall|ne relève pas|Démarches Simplifiées|7(?:[  ,.]?)500/i,
        );
      }
    },
  );
});

// item 24: section 02 relied on the Sirene registry for the headcount
// band ("20 à 49 salariés d'après le répertoire Sirene") but never
// printed the SIREN itself or an extraction date, leaving a lawyer or
// auditor no way to independently verify which entity the determination
// concerns.
describe('item 24: the SIREN and extraction date are printed', () => {
  it('prints an extracted SIREN with the audit date', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [],
        siren: '552032534',
      },
    });
    const html = renderLegalExposure(fr, 2, 'fr', undefined, new Date('2026-08-17'), manifest, []);
    expect(html).toContain('552032534');
  });

  it('a manually supplied SIREN wins over an extracted one', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [],
        siren: '552032534',
      },
    });
    const manualFields = {
      siren: { value: '732829320', provenance: 'operator' as const },
      updatedAt: new Date(),
    };
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      undefined,
      new Date('2026-08-17'),
      manifest,
      [],
      manualFields,
    );
    expect(html).toContain('732829320');
    expect(html).not.toContain('552032534');
  });

  it('states explicitly when no SIREN was ever resolved, rather than omitting the field', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      undefined,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).toContain('Aucun numéro SIREN');
  });
});

// item 28: the transactional/booking flow is the entire legal hook for
// the EAA obligation, but nothing stated whether it was actually in
// scope for the crawl - a delegated off-domain booking engine (common
// for hotels) sits outside a single-origin crawl by construction.
describe('item 28: the transactional-flow crawl scope is stated explicitly', () => {
  it('names the crawled pages when the flow was found directly on this site', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [
          {
            kind: 'checkout-form',
            selector: 'form#booking',
            pageUrl: 'https://example.com/reserver',
            detail: 'action=/reserver',
          },
        ],
      },
    });
    const html = renderLegalExposure(fr, 2, 'fr', undefined, new Date('2026-08-17'), manifest, []);
    expect(html).toContain('https://example.com/reserver');
  });

  // P0.3 (2026-08-21 Large Rule Families feedback pass): a real report listed all
  // 17 non-homepage URLs, including legal-notice pages like /cookies/ and
  // /politique-de-confidentialite/, implying the booking funnel lived on
  // those pages - it's a site-wide layout component, not a page-specific
  // one. This asserts the vendor name renders and legal-notice pages that
  // never appear in the evidence never leak in either.
  it('names the detected component instead of dumping every page it appears on', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [
          {
            kind: 'booking-iframe',
            selector: '#diadao-widget',
            pageUrl: 'https://example.com/',
            detail: 'diadao iframe',
          },
          {
            kind: 'booking-iframe',
            selector: '#diadao-widget',
            pageUrl: 'https://example.com/chambres',
            detail: 'diadao iframe',
          },
        ],
      },
    });
    const html = renderLegalExposure(fr, 2, 'fr', undefined, new Date('2026-08-17'), manifest, []);
    expect(html).toContain('Diadao');
    expect(html).toContain('https://example.com/');
    expect(html).not.toContain('/cookies/');
    expect(html).not.toContain('/politique-de-confidentialite/');
  });

  it('falls back to a generic component sentence when no known vendor prefix matches', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [
          {
            kind: 'checkout-form',
            selector: 'form#booking',
            pageUrl: 'https://example.com/reserver',
            detail: 'action=/reserver',
          },
        ],
      },
    });
    const html = renderLegalExposure(fr, 2, 'fr', undefined, new Date('2026-08-17'), manifest, []);
    expect(html).toContain('composant présent sur plusieurs pages');
  });

  it('names the delegated provider domain and states it was not crawled', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [
          {
            kind: 'delegated-booking-redirect',
            selector: 'a.book-now',
            pageUrl: 'https://example.com/',
            // item 0.2: `detail` is internal English classification
            // reasoning, never the domain shown to the client -
            // providerUrl is what the report derives the hostname from.
            detail: 'Destination page shares the distinctive term "example" with the origin page.',
            providerUrl: 'https://booking.example-engine.com/reserver',
          },
        ],
      },
    });
    const html = renderLegalExposure(fr, 2, 'fr', undefined, new Date('2026-08-17'), manifest, []);
    expect(html).toContain('booking.example-engine.com');
    expect(html).toContain('n&#39;a pas été exploré');
  });

  it('renders nothing when no transactional-flow evidence exists at all', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      undefined,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('parcours transactionnel identifié');
  });
});

// item 0.1/1.11 (Large Rule Families pass): "report, don't conclude" requires
// printing every registry input relied on (denomination, effectifs
// bracket, retrieval date, source), not just the SIREN.
describe('item 0.1/1.11: the full registry snapshot is printed when a Sirene lookup succeeded', () => {
  it('prints denomination, SIREN, effectifs bracket, date and source together', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [],
        siren: '790852578',
      },
    });
    const assessment = {
      status: 'in_scope' as const,
      basis: [],
      registrySnapshot: {
        denomination: 'O DE LA DUNE',
        effectifBandLabel: '20 à 49 salariés',
        retrievedAt: new Date('2026-08-19'),
        source: 'siren:extracted',
      },
    };
    const html = renderLegalExposure(fr, 2, 'fr', assessment, new Date('2026-08-19'), manifest, []);
    expect(html).toContain('O DE LA DUNE');
    expect(html).toContain('790852578');
    expect(html).toContain('20 à 49 salariés');
    expect(html).not.toContain('siren:extracted');
    // P2.1 (2026-08-21 Large Rule Families feedback pass): a real report showed
    // "(O! DE LA DUNE", an unbalanced parenthesis reproduced verbatim
    // from the Sirene registry - this note explains why rather than
    // reading as a scraping error.
    expect(html).toContain('reproduite telle qu');
  });

  it('falls back to the SIREN-only note when no registry snapshot exists (no successful Sirene lookup)', () => {
    const manifest = fakeManifest({
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [],
        siren: '552032534',
      },
    });
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      { status: 'undetermined', basis: [] },
      new Date('2026-08-17'),
      manifest,
      [],
    );
    expect(html).toContain('552032534');
    expect(html).not.toContain('Données du répertoire Sirene');
  });
});

describe('RF-03: the internal out_of_scope state renders observed inputs, not a conclusion', () => {
  it('contains no out-of-scope conclusion', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      { status: 'out_of_scope', basis: [] },
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('Hors champ');
    expect(html).not.toContain('ne relève pas de l&#39;obligation');
    expect(html).toContain('Seuil ou parcours non observé');
  });
});

// item 0.1: a manual hasTransactionalFlow override disagreeing with the
// detector must be visible, not silently trusted.
describe('item 0.1: a transactional-flow signal conflict is stated explicitly', () => {
  it('states the conflict when a manual override contradicts the detector', () => {
    const assessment = {
      status: 'out_of_scope' as const,
      basis: [],
      siteSignalResolutions: {
        hasTransactionalFlow: { value: false, source: 'manual' as const, detectedValue: true },
      },
    };
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      assessment,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).toContain('Signal contradictoire');
  });

  it('renders nothing when the manual value agrees with the detector', () => {
    const assessment = {
      status: 'in_scope' as const,
      basis: [],
      siteSignalResolutions: {
        hasTransactionalFlow: { value: true, source: 'manual' as const, detectedValue: true },
      },
    };
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      assessment,
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('Signal contradictoire');
  });

  it('renders nothing when there is no resolution recorded at all', () => {
    const html = renderLegalExposure(
      fr,
      2,
      'fr',
      { status: 'in_scope', basis: [] },
      new Date('2026-08-17'),
      fakeManifest(),
      [],
    );
    expect(html).not.toContain('Signal contradictoire');
  });
});
