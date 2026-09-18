/**
 * Stress fixture for the report design, per docs/report/report-design-system.md
 * section 5: layout is iterated against this, never against a real client
 * scan, because a real scan (haaitza, sas-fernande) has never been the
 * thing that broke the layout - a mock dataset that never grew past its
 * original 14 findings was. A generator, not committed JSON: hitting the
 * doc's exact counts (120 findings, 95+ minor, 8 themes, 12 render-diff
 * failures, specific pathological strings) is easier to keep correct in
 * code than in a hand-edited fixture file, and it type-checks against the
 * locked Finding/AuditManifest/StoredLlmOutput contracts.
 *
 * "If the stress fixture renders correctly, haaitza and hotel-palais-
 * gallien render correctly. The reverse has never been true." - this
 * module exists so that claim keeps being true.
 */

import {
  RENDERDIFF_RULE_ID,
  type AuditManifest,
  type Finding,
  type FindingCategory,
  type StoredLlmOutput,
  type ManifestPageEntry,
  type ObligationAssessment,
  type Severity,
  type StoredTheme,
} from '@odysseus/core';
import type { StoredAnalysis } from './types.js';

const SITE_URL = 'https://stress-fixture.example.com/';
const PAGE_COUNT = 20;
const RENDER_DIFF_FAILURE_COUNT = 12;
const MINOR_FINDING_COUNT = 95;
const TOTAL_FINDING_COUNT = 120;
const THEME_COUNT = 8;

/** 180 characters, a single unbroken token (no spaces, hyphens, or other
 *  natural break opportunities) - doc §5's overflow-defence stress case
 *  for paged.css's `.mono`/`.selector-cell` overflow-wrap rules. */
const LONG_NO_BREAK_SELECTOR = `.${'a'.repeat(178)}x`;

/** The full page URL (not just the path) is exactly 140 characters -
 *  "page URL" means the value actually stored in
 *  ManifestPageEntry.url/Finding.pageUrls, never a bare path. */
const LONG_PAGE_URL = `${SITE_URL}${'p'.repeat(140 - SITE_URL.length - 6)}-page/`;

/** Exactly 120 characters. */
const LONG_THEME_TITLE =
  'Ce titre de chantier est délibérément beaucoup trop long pour vérifier que la mise en page ne casse jamais, jamais, jamais.'.slice(
    0,
    120,
  );

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function buildPages(): ManifestPageEntry[] {
  const pages: ManifestPageEntry[] = [];

  for (let i = 0; i < PAGE_COUNT; i++) {
    const isHomepage = i === 0;
    const url = i === 1 ? LONG_PAGE_URL : isHomepage ? SITE_URL : `${SITE_URL}page-${pad(i, 2)}/`;
    const hasRenderDiffFailure = i < RENDER_DIFF_FAILURE_COUNT;
    const missingPercent = hasRenderDiffFailure ? 25 + i * 4 : 0;

    const coreWebVitals: ManifestPageEntry['coreWebVitals'] =
      i % 3 === 0
        ? undefined
        : {
            lcp: {
              score: 0.6,
              numericValue: 2200 + i * 300,
              displayValue: `${(2.2 + i * 0.3).toFixed(1)} s`,
            },
            cls: {
              score: 0.8,
              numericValue: 0.05 + i * 0.01,
              displayValue: `${(0.05 + i * 0.01).toFixed(2)}`,
            },
            tbt: { score: 0.7, numericValue: 150 + i * 20, displayValue: `${150 + i * 20} ms` },
            fcp: {
              score: 0.7,
              numericValue: 900 + i * 100,
              displayValue: `${((900 + i * 100) / 1000).toFixed(1)} s`,
            },
            speedIndex: {
              score: 0.6,
              numericValue: 2000 + i * 200,
              displayValue: `${((2000 + i * 200) / 1000).toFixed(1)} s`,
            },
          };

    pages.push({
      url,
      pageDir: `pages/page-${pad(i, 2)}`,
      depth: isHomepage ? 0 : 1,
      status: 'visited',
      httpStatus: 200,
      renderDiffMissingPercent: missingPercent,
      ...(coreWebVitals ? { coreWebVitals } : {}),
      errors: {},
    });
  }

  return pages;
}

function buildManifest(): AuditManifest {
  return {
    auditId: 'stress-fixture-audit',
    kind: 'audit',
    siteUrl: SITE_URL,
    startedAt: '2026-08-16T00:00:00.000Z',
    finishedAt: '2026-08-16T00:30:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.62.1',
      chromiumVersion: '131.0.0',
    },
    config: {
      maxPages: PAGE_COUNT,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: SITE_URL,
      visitedCount: PAGE_COUNT,
      maxPages: PAGE_COUNT,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: buildPages(),
  };
}

function buildFinding(
  overrides: Partial<Finding> & Pick<Finding, 'findingId' | 'ruleId' | 'category' | 'severity'>,
): Finding {
  const pageUrl = overrides.pageUrls?.[0] ?? SITE_URL;
  return {
    auditId: 'stress-fixture-audit',
    schemaVersion: 1,
    source: 'axe',
    wcagCriteria: [],
    title: `${overrides.ruleId} on ${pageUrl}`,
    description: 'Stress fixture finding.',
    pageUrls: [pageUrl],
    occurrences: 1,
    elements: [{ pageUrl, selector: `.el-${overrides.findingId}`, snippet: '<div></div>' }],
    rawEvidence: {},
    dedupeKey: `dk-${overrides.findingId}`,
    firstSeenAt: new Date('2026-08-16T00:00:00.000Z'),
    lastSeenAt: new Date('2026-08-16T00:00:00.000Z'),
    ...overrides,
  };
}

const WCAG_CRITERIA_ROTATION = ['1.4.3', '2.4.4', '4.1.2', '2.5.8', '1.1.1', '1.4.1', '2.4.7'];

function buildRenderDiffFindings(pages: readonly ManifestPageEntry[]): Finding[] {
  return pages.slice(0, RENDER_DIFF_FAILURE_COUNT).map((page, i) => {
    const rawTextLength = 200 + i * 10;
    const renderedTextLength = Math.round(
      rawTextLength / (1 - (page.renderDiffMissingPercent ?? 25) / 100),
    );
    return buildFinding({
      findingId: `f-rd-${pad(i, 3)}`,
      ruleId: RENDERDIFF_RULE_ID,
      category: 'rendering',
      severity: 'moderate',
      pageUrls: [page.url],
      elements: [
        { pageUrl: page.url, selector: i === 0 ? LONG_NO_BREAK_SELECTOR : '.hero', snippet: '' },
      ],
      rawEvidence: {
        perPage: {
          [page.url]: {
            pageUrl: page.url,
            rawTextLength,
            renderedTextLength,
            missingPercent: page.renderDiffMissingPercent ?? 25,
            consoleErrors: [],
            httpStatus: 200,
          },
        },
      },
    });
  });
}

function buildOtherNonMinorFindings(count: number): Finding[] {
  const severities: Severity[] = ['critical', 'serious', 'moderate'];
  const categories: FindingCategory[] = ['accessibility', 'seo', 'performance', 'geo'];
  const reviewedRuleIds = [
    'color-contrast',
    'canonical-missing',
    'largest-contentful-paint',
    'jsonld-missing',
    'button-name',
    'document-title',
  ] as const;
  const findings: Finding[] = [];

  for (let i = 0; i < count; i++) {
    const severity = severities[i % severities.length]!;
    const category = categories[i % categories.length]!;
    const wcagCriteria =
      category === 'accessibility'
        ? [WCAG_CRITERIA_ROTATION[i % WCAG_CRITERIA_ROTATION.length]!]
        : [];
    findings.push(
      buildFinding({
        findingId: `f-nm-${pad(i, 3)}`,
        // The stress fixture reaches the full report builder, whose
        // fail-closed remediation contract intentionally rejects invented
        // rule IDs. Rotate through reviewed real rules while keeping the
        // fixture's volume and category distribution synthetic.
        ruleId: reviewedRuleIds[i % reviewedRuleIds.length]!,
        category,
        severity,
        wcagCriteria,
        pageUrls: [SITE_URL],
        occurrences: 1 + (i % 4),
      }),
    );
  }

  return findings;
}

function buildMinorFindings(count: number): Finding[] {
  const categories: FindingCategory[] = ['accessibility', 'seo', 'performance', 'rendering', 'geo'];
  const ruleCount = 15;
  const findings: Finding[] = [];

  for (let i = 0; i < count; i++) {
    const ruleIndex = i % ruleCount;
    findings.push(
      buildFinding({
        findingId: `f-min-${pad(i, 3)}`,
        ruleId: `stress-minor-rule-${ruleIndex}`,
        category: categories[i % categories.length]!,
        severity: 'minor',
        pageUrls: [SITE_URL],
        occurrences: 1 + (i % 3),
      }),
    );
  }

  return findings;
}

function buildThemes(findings: readonly Finding[]): StoredTheme[] {
  const nonMinor = findings.filter((f) => f.severity !== 'minor');
  const categories: StoredTheme['category'][] = [
    'accessibility',
    'seo',
    'performance',
    'rendering',
  ];
  const effortLevels: StoredTheme['effort'][] = ['low', 'medium', 'high'];
  const impactLevels: StoredTheme['impact'][] = ['low', 'medium', 'high'];

  return Array.from({ length: THEME_COUNT }, (_, i) => {
    const themeFindings = nonMinor.filter((_, idx) => idx % THEME_COUNT === i);
    const findingIds =
      themeFindings.length > 0 ? themeFindings.map((f) => f.findingId) : [nonMinor[0]!.findingId];
    const category = categories[i % categories.length]!;

    return {
      title: i === 0 ? LONG_THEME_TITLE : `Chantier prioritaire numéro ${i + 1}`,
      category,
      businessImpact: buildLongBusinessImpact(i + 1),
      legalRelevance:
        category === 'accessibility'
          ? `Critère WCAG concerné pour le chantier ${i + 1}.`
          : undefined,
      effort: effortLevels[i % effortLevels.length]!,
      impact: impactLevels[(i + 1) % impactLevels.length]!,
      priorityRank: i + 1,
      findingIds,
      recommendedActions: buildLongRecommendedActions(i + 1),
    };
  });
}

/**
 * Plan 027 step 5: businessImpact's raised ceiling (5 sentences, see
 * writing-schema.ts) needs a pagination stress case, not just a raised
 * number in a test. Every theme here reaches the new maximum instead of a
 * single short sentence, so the stress fixture actually exercises the
 * height it now allows.
 */
function buildLongBusinessImpact(themeNumber: number): string {
  return [
    `Ce chantier prioritaire numéro ${themeNumber} touche une part importante des visiteurs du site.`,
    'Les clients concernés rencontrent une gêne concrète au moment où ils cherchent à réserver ou à obtenir une information clé.',
    'Cette gêne se traduit par des abandons qui ne sont pas visibles dans les statistiques habituelles, sans un audit dédié.',
    'Le préjudice commercial se cumule mois après mois tant que le chantier reste ouvert.',
    'Une correction rapide limite ce préjudice avant la prochaine période de forte affluence.',
  ].join(' ');
}

/**
 * Plan 027 step 5: recommendedActions' raised ceiling (5 entries) using the
 * longest approved provider phrase, so the stress fixture also exercises
 * the longest realistic recommendedActions text width, not just its count.
 */
function buildLongRecommendedActions(themeNumber: number): string[] {
  const provider = "l'équipe technique en charge de votre site";
  return [
    `Demandez à ${provider} de corriger ce point pour le chantier ${themeNumber} dans les meilleurs délais.`,
    `Faites confirmer par ${provider} que la correction du chantier ${themeNumber} a bien été déployée en production.`,
    `Demandez à ${provider} de vérifier qu'aucune régression similaire n'affecte les pages voisines du chantier ${themeNumber}.`,
    `Faites documenter par ${provider} la correction apportée au chantier ${themeNumber} pour un suivi ultérieur.`,
    `Demandez à ${provider} de reformuler le contenu concerné par le chantier ${themeNumber} de manière plus claire pour les clients.`,
  ];
}

const OBLIGATION_ASSESSMENT: ObligationAssessment = {
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

export interface StressFixture {
  manifest: AuditManifest;
  findings: Finding[];
  analysis: StoredAnalysis;
}

/** The main stress fixture, satisfying every bullet in doc §5. */
export function buildStressFixture(): StressFixture {
  const manifest = buildManifest();
  const renderDiffFindings = buildRenderDiffFindings(manifest.pages);
  const otherNonMinorFindings = buildOtherNonMinorFindings(
    TOTAL_FINDING_COUNT - MINOR_FINDING_COUNT - renderDiffFindings.length,
  );
  const minorFindings = buildMinorFindings(MINOR_FINDING_COUNT);
  const findings = [...renderDiffFindings, ...otherNonMinorFindings, ...minorFindings];

  const themes = buildThemes(findings);
  const llmOutput: StoredLlmOutput = {
    executiveSummary:
      'Ce site présente un nombre élevé de constats répartis entre accessibilité, référencement et performance, avec plusieurs priorités à fort impact commercial identifiées ci-dessous.',
    overallRisk: 'high',
    themes,
    quickWins: themes.filter((t) => t.effort === 'low').map((t) => t.findingIds[0]!),
    notes: 'Fixture de stress, aucune donnée réelle.',
  };

  const analysis: StoredAnalysis = {
    ...llmOutput,
    auditId: manifest.auditId,
    language: 'fr',
    model: 'stress-fixture',
    temperature: 0,
    generatedAt: new Date('2026-08-16T00:30:00.000Z'),
    obligationAssessment: OBLIGATION_ASSESSMENT,
  };

  return { manifest, findings, analysis };
}

/** Doc §5: "one audit with zero failing WCAG criteria" - exercises the
 *  empty branch of sections 07 (conformance summary) and 10 (accessibility
 *  statement). Every accessibility finding's wcagCriteria is cleared. */
export function buildStressFixtureNoWcagFailures(): StressFixture {
  const base = buildStressFixture();
  const findings = base.findings.map((f) =>
    f.wcagCriteria.length > 0 ? { ...f, wcagCriteria: [] } : f,
  );
  const themes = base.analysis.themes.map((t) => ({ ...t, legalRelevance: undefined }));
  return {
    manifest: base.manifest,
    findings,
    analysis: { ...base.analysis, themes },
  };
}

/** Doc §5: "one audit with zero findings" - exercises every section's
 *  empty-input branch at once. */
export function buildStressFixtureNoFindings(): StressFixture {
  const base = buildStressFixture();
  const manifest: AuditManifest = {
    ...base.manifest,
    pages: base.manifest.pages.map((page) => ({ ...page, renderDiffMissingPercent: 0 })),
  };
  return {
    manifest,
    findings: [],
    analysis: {
      ...base.analysis,
      overallRisk: 'low',
      themes: [],
      quickWins: [],
    },
  };
}
