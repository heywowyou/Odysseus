import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, StoredTheme } from '@odysseus/core';
import { renderExecutiveSummary } from './executive-summary.js';
import { getStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';

function buildFinding(findingId: string): Finding {
  return {
    findingId,
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'rule',
    category: 'accessibility',
    severity: 'moderate',
    wcagCriteria: [],
    title: 't',
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: findingId,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

describe('renderExecutiveSummary against the real small-site.test analysis', () => {
  it('references the top 3 themes by rank and title as jump links, capped at 3 (doc §3 section 01)', async () => {
    const analysis = await loadSmallSiteAnalysis('fr');
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, manifest);

    const sorted = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank);
    const top3 = sorted.slice(0, 3);

    for (const theme of top3) {
      expect(html).toContain(`href="#theme-${theme.priorityRank}"`);
    }
    // businessImpact prose must not be duplicated into this block - it
    // already appears once, in the theme card itself.
    for (const theme of top3) {
      const impactSnippet = theme.businessImpact.slice(0, 30);
      const occurrences = html.split(impactSnippet).length - 1;
      expect(occurrences).toBeLessThanOrEqual(0);
    }

    if (sorted.length > 3) {
      expect(html).not.toContain(`href="#theme-${sorted[3]!.priorityRank}"`);
    }
  });

  it('renders the LLM executive summary prose verbatim (escaped)', async () => {
    const analysis = await loadSmallSiteAnalysis('en');
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderExecutiveSummary(getStrings('en'), 1, analysis, findings, manifest);

    expect(html).toContain(analysis.executiveSummary.slice(0, 30));
  });

  // item 5: the jump-link's own visible label states its destination
  // instead of a bare "Voir ->"/"See ->" repeated identically 3 times
  // with no stated destination. The label's size and accent color set it
  // apart from the plain-text theme title beside it; the underline was
  // dropped on the operator's 2026-09-03 direction so the link matches
  // the flat source's non-underlined label.
  it('item 5: each jump link names its own priority rank, not a bare arrow, and carries no underline', async () => {
    const analysis = await loadSmallSiteAnalysis('fr');
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, manifest);
    const topThemes = [...analysis.themes]
      .sort((a, b) => a.priorityRank - b.priorityRank)
      .slice(0, 3);

    for (const theme of topThemes) {
      expect(html).toContain(`Voir priorité ${theme.priorityRank}`);
    }
    expect(html).not.toContain('>Voir →<');
    expect(html).not.toContain('text-decoration:underline');
  });

  // item 3.4: the link used to repeat the full theme title a second time
  // right next to the title's own span ("Voir priorité 1 : lenteur
  // d'affichage" beside "lenteur d'affichage"), wrapping the row on a
  // long title. The rank-only label still gives the link its own
  // stand-alone accessible text (item 5's requirement) without the
  // duplication.
  it('item 3.4: the jump link no longer repeats the theme title a second time next to its own title span', async () => {
    const analysis = await loadSmallSiteAnalysis('fr');
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, manifest);
    const topThemes = [...analysis.themes]
      .sort((a, b) => a.priorityRank - b.priorityRank)
      .slice(0, 3);

    for (const theme of topThemes) {
      expect(html).not.toContain(
        `Voir priorité ${theme.priorityRank} : ${escapeHtml(theme.title)}`,
      );
    }
  });
});

// item 16: the document's first, most prominent recommendation carrying
// "Conformité : Sans objet" should not be something the reader has to
// notice on their own after four pages of legal framing (cover, section
// 02, section 07).
//
// A7b (2026-08-24): the note used to say the top priority was "un enjeu
// commercial, pas un enjeu de conformité légale". legalRelevance is built
// only for accessibility themes with WCAG criteria, so that claimed no legal
// weight for privacy, LCEN and security themes it knows nothing about - on a
// real report whose section 03 now carries an LCEN breach. The assertions
// below follow the narrowed claim; top-priority-legal-note.test.ts pins the
// copy itself.
describe('item 16: a non-legal top priority is acknowledged in the executive summary', () => {
  const nonLegalTheme = {
    title: 'Vitesse mobile insuffisante',
    category: 'performance' as const,
    businessImpact: 'Impact',
    effort: 'medium' as const,
    impact: 'high' as const,
    priorityRank: 1,
    findingIds: ['f001'],
    recommendedActions: ['Action'],
  };
  const legalTheme = {
    title: 'Contraste insuffisant',
    category: 'accessibility' as const,
    businessImpact: 'Impact',
    legalRelevance: 'Critère 1.4.3 (Contraste minimum), WCAG 2.2 niveau AA',
    effort: 'low' as const,
    impact: 'medium' as const,
    priorityRank: 2,
    findingIds: ['f002'],
    recommendedActions: ['Action'],
  };

  function buildAnalysis(themes: StoredTheme[]) {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes,
      quickWins: [],
      notes: '',
    };
  }

  const emptyManifest: AuditManifest = {
    auditId: 'a1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
  };

  it('states the top priority is commercial and points to the legal-priority rank, when one is rendered', () => {
    const analysis = buildAnalysis([nonLegalTheme, legalTheme]);
    const html = renderExecutiveSummary(
      getStrings('fr'),
      1,
      analysis,
      [buildFinding('f001'), buildFinding('f002')],
      emptyManifest,
    );

    expect(html).toContain('La priorité 1 n’est rattachée à aucun critère d’accessibilité');
    expect(html).toContain('position 2');
  });

  it('states the top priority is commercial with no pointer when no legal-relevant theme is rendered at all', () => {
    const analysis = buildAnalysis([nonLegalTheme]);
    const html = renderExecutiveSummary(
      getStrings('fr'),
      1,
      analysis,
      [buildFinding('f001')],
      emptyManifest,
    );

    expect(html).toContain('La priorité 1 n’est rattachée à aucun critère d’accessibilité');
    expect(html).toContain('Aucune des priorités');
  });

  it('renders nothing extra when the top priority is itself legal-relevant', () => {
    const legalThemeRankedFirst = { ...legalTheme, priorityRank: 1 };
    const nonLegalThemeRankedSecond = { ...nonLegalTheme, priorityRank: 2 };
    const analysis = buildAnalysis([legalThemeRankedFirst, nonLegalThemeRankedSecond]);
    const html = renderExecutiveSummary(
      getStrings('fr'),
      1,
      analysis,
      [buildFinding('f001'), buildFinding('f002')],
      emptyManifest,
    );

    expect(html).not.toContain('rattachée à aucun critère');
  });

  it('item 0.4: the counts sentence is bound from the findings passed in, never from the model prose', () => {
    const analysis = buildAnalysis([nonLegalTheme]);
    const findings = [
      { severity: 'critical' } as const,
      { severity: 'critical' } as const,
      { severity: 'serious' } as const,
      { severity: 'minor' } as const,
    ].map((overrides, i) => ({
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      findingId: `f${i}`,
      ruleId: 'rule',
      category: 'accessibility' as const,
      wcagCriteria: [],
      title: 'title',
      description: 'description',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: `dk-${i}`,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    }));
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    expect(html).toContain(
      'Le diagnostic a relevé 4 constats distincts, dont 3 critiques ou sérieux (2 critiques et 1 sérieux)',
    );
  });

  // Plan 018 step 6: the model's qualitative summary leads the section and
  // the template-owned counts follow beneath it. The digit guard is
  // unchanged: both sentences are still bound from the findings passed in,
  // never from the model's own prose (item 0.4 above pins that binding).
  it('plan 018 step 6: renders the model prose before the counts sentence, in French and English', () => {
    const findings = [
      { severity: 'critical' } as const,
      { severity: 'critical' } as const,
      { severity: 'serious' } as const,
      { severity: 'minor' } as const,
    ].map((overrides, i) => ({
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      findingId: `f${i}`,
      ruleId: 'rule',
      category: 'accessibility' as const,
      wcagCriteria: [],
      title: 'title',
      description: 'description',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: `dk-${i}`,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    }));

    const frAnalysis = { ...buildAnalysis([nonLegalTheme]) };
    frAnalysis.executiveSummary = 'Le site montre des signes de vieillissement.';
    const frHtml = renderExecutiveSummary(getStrings('fr'), 1, frAnalysis, findings, emptyManifest);
    const frProseIndex = frHtml.indexOf('Le site montre des signes de vieillissement.');
    const frCountsIndex = frHtml.indexOf('4 constats distincts');
    expect(frProseIndex).toBeGreaterThan(-1);
    expect(frCountsIndex).toBeGreaterThan(-1);
    expect(frProseIndex).toBeLessThan(frCountsIndex);

    const enAnalysis = { ...buildAnalysis([nonLegalTheme]), language: 'en' as const };
    enAnalysis.executiveSummary = 'The site shows its age.';
    const enHtml = renderExecutiveSummary(getStrings('en'), 1, enAnalysis, findings, emptyManifest);
    const enProseIndex = enHtml.indexOf('The site shows its age.');
    const enCountsIndex = enHtml.indexOf('4 distinct findings');
    expect(enProseIndex).toBeGreaterThan(-1);
    expect(enCountsIndex).toBeGreaterThan(-1);
    expect(enProseIndex).toBeLessThan(enCountsIndex);
  });
});

describe('fix #1 (2026-08-25 report review): the covered-by-priorities bridging sentence', () => {
  function buildAnalysis(themes: StoredTheme[]) {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes,
      quickWins: [],
      notes: '',
    };
  }

  const emptyManifest: AuditManifest = {
    auditId: 'a1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
  };

  const theme: StoredTheme = {
    title: 'Priorité 1',
    category: 'accessibility',
    businessImpact: 'Impact',
    effort: 'low',
    impact: 'high',
    priorityRank: 1,
    findingIds: ['f001'],
    recommendedActions: ['Action'],
  };

  it('renders a pointer sentence when the rendered priorities cover fewer findings than were passed in', () => {
    const analysis = buildAnalysis([theme]);
    const findings = [buildFinding('f001'), buildFinding('f002')];
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    // Issue #307: the priorities sit several pages later, so the sentence
    // names their section rather than pointing "below".
    expect(html).toMatch(
      /Les priorités présentées dans la section «\s*Priorités de correction\s*» en couvrent 1/,
    );
    expect(html).not.toContain('ci-dessous');
    expect(html).toContain('Autres constats');
  });

  it('names the total the coverage figure is drawn from', () => {
    // The sentence above it ends on the critical/serious subtotal, so a
    // bare "en couvrent 1" left the reader two candidate denominators.
    const analysis = buildAnalysis([theme]);
    const findings = [buildFinding('f001'), buildFinding('f002')];
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    expect(html).toMatch(/en couvrent 1 sur 2\s*;/);
  });

  it('renders nothing when every finding is covered by a rendered priority', () => {
    const analysis = buildAnalysis([theme]);
    const findings = [buildFinding('f001')];
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    expect(html).not.toContain('en couvrent');
  });

  it('renders nothing when no priority is rendered at all', () => {
    const analysis = buildAnalysis([]);
    const findings = [buildFinding('f001')];
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    expect(html).not.toContain('en couvrent');
  });
});

// P2.4 (2026-08-21 Large Rule Families feedback pass): sets the expectation up
// front rather than letting the reader discover, 20 pages in, that the
// SEO/GEO pillars have little to say relative to accessibility.
describe('P2.4: the category-imbalance note', () => {
  const analysis = {
    auditId: 'a1',
    language: 'fr' as const,
    model: 'test-model',
    temperature: 0,
    generatedAt: new Date(),
    overallRisk: 'medium' as const,
    executiveSummary: 'summary',
    themes: [] as StoredTheme[],
    quickWins: [],
    notes: '',
  };
  const emptyManifest: AuditManifest = {
    auditId: 'a1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: new Date(),
    finishedAt: new Date(),
    pages: [],
    crawl: { maxPages: 20, maxDepth: 5, visitedCount: 0 },
    tool: {},
  } as never;

  function findingWithCategory(id: string, category: 'accessibility' | 'seo' | 'geo'): Finding {
    return { ...buildFinding(id), category };
  }

  it('renders when accessibility dominates and SEO/GEO contributed at least one finding', () => {
    const findings = [
      ...['f1', 'f2', 'f3', 'f4'].map((id) => findingWithCategory(id, 'accessibility')),
      findingWithCategory('f5', 'seo'),
    ];
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    expect(html).toContain('le référencement naturel et la visibilité dans les assistants IA');
  });

  it('renders nothing when there are no SEO/GEO findings at all', () => {
    const findings = ['f1', 'f2'].map((id) => findingWithCategory(id, 'accessibility'));
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    expect(html).not.toContain('le référencement naturel et la visibilité dans les assistants IA');
  });

  it('renders nothing when accessibility does not dominate', () => {
    const findings = [
      findingWithCategory('f1', 'accessibility'),
      findingWithCategory('f2', 'seo'),
      findingWithCategory('f3', 'geo'),
    ];
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, emptyManifest);

    expect(html).not.toContain('le référencement naturel et la visibilité dans les assistants IA');
  });
});

// Issue #315: paragraphs capped themselves in `ch`, which scales with each
// paragraph's own font size, so the synthesis lead, its notes and the
// regulatory callout ran to different widths on one page.
describe('issue #315: one reading measure', () => {
  it('caps report prose with the shared measure token, never a font-relative ch width', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const sources = (await readdir(dir)).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'cover.ts',
    );
    for (const name of sources) {
      const source = await readFile(path.join(dir, name), 'utf-8');
      expect(source, name).not.toMatch(/max-width:\d+ch/);
    }
  });

  it('lets callout text fill its card', async () => {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const source = await readFile(path.join(dir, 'executive-summary.ts'), 'utf-8');
    const callout = source.slice(source.indexOf('data-executive-regulatory-context'));
    expect(callout.slice(0, callout.indexOf('</div>\n  `'))).not.toContain('max-width');
  });
});
