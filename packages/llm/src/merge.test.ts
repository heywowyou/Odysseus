import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { mergeAnalysisPasses } from './merge.js';
import type { StructureDocument } from './structure-schema.js';
import type { WritingPassOutput } from './writing-schema.js';

function buildFinding(findingId: string, wcagCriteria: string[]): Finding {
  return {
    findingId,
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria,
    title: 'Insufficient color contrast',
    description: 'Text does not meet minimum contrast ratio',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dedupe-${findingId}`,
    firstSeenAt: new Date('2026-08-02T00:00:00Z'),
    lastSeenAt: new Date('2026-08-02T00:00:00Z'),
  };
}

// f2 deliberately carries a wcagCriteria value even though its theme's
// category is 'seo' - legalRelevance must gate on the theme's category,
// not merely on whether the underlying finding happens to have a WCAG tag.
const filteredFindings: Finding[] = [buildFinding('f1', ['1.4.3']), buildFinding('f2', ['1.1.1'])];

function buildStructureDoc(): Pick<StructureDocument, 'themes' | 'quickWins' | 'overallRisk'> {
  return {
    themes: [
      {
        themeKey: 't1',
        findingIds: ['f1'],
        category: 'accessibility',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
      },
      {
        themeKey: 't2',
        findingIds: ['f2'],
        category: 'seo',
        effort: 'medium',
        impact: 'medium',
        priorityRank: 2,
      },
    ],
    quickWins: ['f1'],
    overallRisk: 'medium',
  };
}

function buildWritingOutput(): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contrast issues',
        businessImpact: 'Some users cannot read the text.',
        recommendedActions: ['Increase contrast ratio.'],
      },
      {
        themeKey: 't2',
        title: 'Missing meta descriptions',
        businessImpact: 'Search results look less compelling.',
        recommendedActions: ['Add meta descriptions.'],
      },
    ],
    executiveSummary: 'Summary.',
    notes: '',
  };
}

describe('mergeAnalysisPasses', () => {
  it('merges structure and writing themes by themeKey, and themeKey never leaks into the output', () => {
    const merged = mergeAnalysisPasses(buildStructureDoc(), buildWritingOutput(), filteredFindings, 'en');

    expect(merged.themes).toHaveLength(2);
    for (const theme of merged.themes) {
      expect(Object.keys(theme)).not.toContain('themeKey');
    }
  });

  it('builds legalRelevance deterministically for an accessibility theme, and omits it for a non-accessibility theme even when its finding carries a WCAG criterion', () => {
    const merged = mergeAnalysisPasses(buildStructureDoc(), buildWritingOutput(), filteredFindings, 'fr');

    const accessibilityTheme = merged.themes.find((t) => t.category === 'accessibility');
    const seoTheme = merged.themes.find((t) => t.category === 'seo');

    expect(accessibilityTheme?.legalRelevance).toBe(
      'Critère 1.4.3 (Contraste minimum), WCAG 2.2 niveau AA, référencé par la norme EN 301 549.',
    );
    expect(seoTheme?.legalRelevance).toBeUndefined();
  });

  it('carries structure-decided fields and writing-decided prose onto the same theme', () => {
    const merged = mergeAnalysisPasses(buildStructureDoc(), buildWritingOutput(), filteredFindings, 'en');
    const theme = merged.themes.find((t) => t.findingIds.includes('f1'));

    expect(theme).toMatchObject({
      title: 'Contrast issues',
      category: 'accessibility',
      businessImpact: 'Some users cannot read the text.',
      effort: 'low',
      impact: 'high',
      priorityRank: 1,
      findingIds: ['f1'],
      recommendedActions: ['Increase contrast ratio.'],
    });
    expect(merged.overallRisk).toBe('medium');
    expect(merged.quickWins).toEqual(['f1']);
    expect(merged.executiveSummary).toBe('Summary.');
  });

  it('throws when a writing-pass theme is missing for a structure themeKey', () => {
    const writingOutput = buildWritingOutput();
    writingOutput.themes = writingOutput.themes.filter((t) => t.themeKey !== 't2');

    expect(() => mergeAnalysisPasses(buildStructureDoc(), writingOutput, filteredFindings, 'en')).toThrow(
      /merge invariant violated/,
    );
  });
});
