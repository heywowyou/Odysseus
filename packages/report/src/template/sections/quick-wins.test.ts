import { describe, expect, it } from 'vitest';
import type { Finding, Theme } from '@odysseus/core';
import { renderWhatToDoFirst } from './quick-wins.js';
import { getStrings } from '../strings/i18n.js';
import type { StoredAnalysis } from '../../types.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings } from '../../test-fixtures.js';

const baseFinding: Finding = {
  findingId: 'f001',
  auditId: 'a',
  schemaVersion: 1,
  source: 'axe',
  ruleId: 'color-contrast',
  category: 'accessibility',
  severity: 'serious',
  wcagCriteria: ['1.4.3'],
  title: 'Elements must meet minimum color contrast ratio thresholds',
  description: 'desc',
  pageUrls: ['https://example.com/'],
  occurrences: 1,
  elements: [],
  rawEvidence: {},
  dedupeKey: 'k',
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
};

const baseAnalysis: StoredAnalysis = {
  auditId: 'a',
  language: 'fr',
  model: 'test',
  temperature: 0.2,
  generatedAt: new Date(),
  executiveSummary: 'summary',
  overallRisk: 'medium',
  themes: [],
  quickWins: ['f001'],
  notes: '',
};

describe('renderWhatToDoFirst', () => {
  it('never renders a raw Finding.title, since it is scanner text, not client-facing copy', () => {
    const html = renderWhatToDoFirst(getStrings('fr'), baseAnalysis, [baseFinding]);
    expect(html).not.toContain(baseFinding.title);
  });

  it('uses the covering theme title when a quick win belongs to a theme', () => {
    const theme: Theme = {
      title: 'Le contraste des couleurs est insuffisant',
      category: 'accessibility',
      businessImpact: 'impact',
      effort: 'low',
      impact: 'high',
      priorityRank: 1,
      findingIds: ['f001'],
      recommendedActions: ['action'],
    };
    const analysis: StoredAnalysis = { ...baseAnalysis, themes: [theme] };

    const html = renderWhatToDoFirst(getStrings('fr'), analysis, [baseFinding]);
    expect(html).toContain(theme.title);
    expect(html).not.toContain(baseFinding.title);
  });

  it('falls back to bilingual category and severity labels when no theme covers the quick win', () => {
    const analysis: StoredAnalysis = { ...baseAnalysis, themes: [] };

    const htmlFr = renderWhatToDoFirst(getStrings('fr'), analysis, [baseFinding]);
    expect(htmlFr).toContain('Accessibilité');
    expect(htmlFr).toContain('Important');
    expect(htmlFr).not.toContain(baseFinding.title);

    const htmlEn = renderWhatToDoFirst(getStrings('en'), analysis, [baseFinding]);
    expect(htmlEn).toContain('Accessibility');
    expect(htmlEn).toContain('Serious');
    expect(htmlEn).not.toContain(baseFinding.title);
  });

  it('against the real sas-fernande.fr analysis, resolves every quick win to a theme title and never leaks a raw finding title', async () => {
    const [analysis, findings] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
    ]);
    const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));

    const html = renderWhatToDoFirst(getStrings('fr'), analysis, findings);

    for (const findingId of analysis.quickWins) {
      const finding = findingsById.get(findingId);
      expect(finding).toBeDefined();
      if (!finding) continue;
      expect(html).not.toContain(finding.title);

      const theme = analysis.themes.find((candidate) => candidate.findingIds.includes(findingId));
      expect(theme).toBeDefined();
      if (theme) expect(html).toContain(theme.title);
    }
  });
});
