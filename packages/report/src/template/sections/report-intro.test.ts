import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { renderReportIntro } from './report-intro.js';
import { getStrings } from '../strings/i18n.js';

function buildFinding(overrides: Record<string, unknown>): Finding {
  return {
    findingId: overrides['findingId'] ?? 'f001',
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'axe' as const,
    ruleId: 'button-name',
    category: 'accessibility' as const,
    severity: 'serious' as const,
    wcagCriteria: ['4.1.2'],
    title: 'Buttons must have discernible text',
    description: 'd',
    pageUrls: [],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: (overrides['findingId'] as string) ?? 'f001',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  } as never;
}

function buildAnalysis(findingIds: string[][]) {
  return {
    auditId: 'a1',
    language: 'fr' as const,
    model: 'test-model',
    temperature: 0,
    generatedAt: new Date(),
    overallRisk: 'medium' as const,
    executiveSummary: 'summary',
    themes: findingIds.map((ids, i) => ({
      title: `Priorité ${i + 1}`,
      category: 'accessibility' as const,
      businessImpact: 'Impact',
      effort: 'low' as const,
      impact: 'high' as const,
      priorityRank: i + 1,
      findingIds: ids,
      recommendedActions: [],
    })),
    quickWins: [],
    notes: '',
  };
}

// P3 (2026-08-21 La Corniche feedback pass): section-00, a new
// non-technical intro page before the résumé, template-driven with no new
// LLM pass - "Vos trois prochaines actions" reuses section-04's own
// top-3-theme data rather than regenerating anything.
describe('renderReportIntro', () => {
  it('renders the audience mapping, the four measures lines, the three consequences, and the not-a-legal-opinion note', () => {
    const analysis = buildAnalysis([]);
    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, []);

    expect(html).toContain('Vous (dirigeant)');
    expect(html).toContain('Votre prestataire / agence web');
    expect(html).toContain('Votre conseil juridique');
    expect(html).toContain('Accessibilité :');
    expect(html).toContain('Référencement (SEO)');
    expect(html).toContain('Visibilité IA (GEO)');
    expect(html).toContain('Rendu :');
    expect(html).toContain('terminer une réservation');
    expect(html).toContain('un avis juridique');
  });

  it('lists the top 3 themes as next actions, naming the agency when a theme is entirely first-party', () => {
    const findings = [buildFinding({ findingId: 'f001', elements: [{ pageUrl: 'https://example.com/', selector: 'header nav a', snippet: '' }] })];
    const analysis = buildAnalysis([['f001']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain('Priorité 1');
    expect(html).toContain('votre agence');
  });

  it('names the vendor when a theme is entirely third-party', () => {
    const findings = [
      buildFinding({ findingId: 'f001', elements: [{ pageUrl: 'https://example.com/', selector: '.gform_wrapper button', snippet: '' }] }),
    ];
    const analysis = buildAnalysis([['f001']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain('Gravity Forms');
  });

  it('names both when a theme spans first- and third-party pages', () => {
    const findings = [
      buildFinding({ findingId: 'f001', elements: [{ pageUrl: 'https://example.com/', selector: 'header nav a', snippet: '' }] }),
      buildFinding({ findingId: 'f002', elements: [{ pageUrl: 'https://example.com/contact', selector: '.gform_wrapper button', snippet: '' }] }),
    ];
    const analysis = buildAnalysis([['f001', 'f002']]);

    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, findings);

    expect(html).toContain('agence et l');
    expect(html).toContain('éditeur du composant tiers');
  });

  it('renders no next-actions list at all when there are no rendered themes', () => {
    const analysis = buildAnalysis([]);
    const html = renderReportIntro(getStrings('fr'), 1, analysis as never, []);

    expect(html).not.toContain('Vos trois prochaines actions');
  });

  it('renders the English chrome strings for an English report, never the French ones', () => {
    const analysis = { ...buildAnalysis([]), language: 'en' as const };
    const html = renderReportIntro(getStrings('en'), 1, analysis as never, []);

    expect(html).toContain('Who each part of this report is for');
    expect(html).not.toContain('À qui s');
  });
});
