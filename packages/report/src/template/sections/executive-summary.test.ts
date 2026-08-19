import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, Theme } from '@odysseus/core';
import { renderExecutiveSummary } from './executive-summary.js';
import { getStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

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

describe('renderExecutiveSummary against the real sas-fernande.fr analysis', () => {
  it('references the top 3 themes by rank and title as jump links, capped at 3 (doc §3 section 01)', async () => {
    const analysis = await loadSasFernandeAnalysis('fr');
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
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
    const analysis = await loadSasFernandeAnalysis('en');
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderExecutiveSummary(getStrings('en'), 1, analysis, findings, manifest);

    expect(html).toContain(analysis.executiveSummary.slice(0, 30));
  });

  // item 5: the jump-link's own visible label states its destination
  // instead of a bare "Voir ->"/"See ->" repeated identically 3 times
  // with no stated destination, and carries a visual affordance (an
  // underline) distinguishing it from the plain-text theme title beside it.
  it('item 5: each jump link names its own priority rank, not a bare arrow, and is visually underlined', async () => {
    const analysis = await loadSasFernandeAnalysis('fr');
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, manifest);
    const topThemes = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, 3);

    for (const theme of topThemes) {
      expect(html).toContain(`Voir priorité ${theme.priorityRank}`);
    }
    expect(html).not.toContain('>Voir →<');
    expect(html).toContain('text-decoration:underline');
  });

  // item 3.4: the link used to repeat the full theme title a second time
  // right next to the title's own span ("Voir priorité 1 : lenteur
  // d'affichage" beside "lenteur d'affichage"), wrapping the row on a
  // long title. The rank-only label still gives the link its own
  // stand-alone accessible text (item 5's requirement) without the
  // duplication.
  it('item 3.4: the jump link no longer repeats the theme title a second time next to its own title span', async () => {
    const analysis = await loadSasFernandeAnalysis('fr');
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, findings, manifest);
    const topThemes = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank).slice(0, 3);

    for (const theme of topThemes) {
      expect(html).not.toContain(`Voir priorité ${theme.priorityRank} : ${escapeHtml(theme.title)}`);
    }
  });
});

// item 16: the document's first, most prominent recommendation carrying
// "Conformité : Sans objet" should not be something the reader has to
// notice on their own after four pages of legal framing (cover, section
// 02, section 07).
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

  function buildAnalysis(themes: Theme[]) {
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
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, [buildFinding('f001'), buildFinding('f002')], emptyManifest);

    expect(html).toContain('La priorité 1 ci-dessus est un enjeu commercial');
    expect(html).toContain('position 2');
  });

  it('states the top priority is commercial with no pointer when no legal-relevant theme is rendered at all', () => {
    const analysis = buildAnalysis([nonLegalTheme]);
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, [buildFinding('f001')], emptyManifest);

    expect(html).toContain('La priorité 1 ci-dessus est un enjeu commercial');
    expect(html).toContain("Aucune des priorités");
  });

  it('renders nothing extra when the top priority is itself legal-relevant', () => {
    const legalThemeRankedFirst = { ...legalTheme, priorityRank: 1 };
    const nonLegalThemeRankedSecond = { ...nonLegalTheme, priorityRank: 2 };
    const analysis = buildAnalysis([legalThemeRankedFirst, nonLegalThemeRankedSecond]);
    const html = renderExecutiveSummary(getStrings('fr'), 1, analysis, [buildFinding('f001'), buildFinding('f002')], emptyManifest);

    expect(html).not.toContain('enjeu commercial');
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

    expect(html).toContain('3 constats prioritaires (2 critiques et 1 sérieux) sur un total de 4 constats');
  });
});
