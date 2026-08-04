import { describe, expect, it } from 'vitest';
import { mergeAnalysisPasses } from './merge.js';
import type { StructureDocument } from './structure-schema.js';
import type { WritingPassOutput } from './writing-schema.js';

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
        legalRelevance: 'WCAG 2.2 1.4.3',
        recommendedActions: ['Increase contrast ratio.'],
      },
      {
        themeKey: 't2',
        title: 'Missing meta descriptions',
        businessImpact: 'Search results look less compelling.',
        // Hallucinated legalRelevance on a non-accessibility theme -
        // must be stripped by the merge.
        legalRelevance: 'This should never survive the merge.',
        recommendedActions: ['Add meta descriptions.'],
      },
    ],
    executiveSummary: 'Summary.',
    notes: '',
  };
}

describe('mergeAnalysisPasses', () => {
  it('merges structure and writing themes by themeKey, and themeKey never leaks into the output', () => {
    const merged = mergeAnalysisPasses(buildStructureDoc(), buildWritingOutput());

    expect(merged.themes).toHaveLength(2);
    for (const theme of merged.themes) {
      expect(Object.keys(theme)).not.toContain('themeKey');
    }
  });

  it('strips legalRelevance on a non-accessibility theme even if the writing pass supplied one', () => {
    const merged = mergeAnalysisPasses(buildStructureDoc(), buildWritingOutput());

    const accessibilityTheme = merged.themes.find((t) => t.category === 'accessibility');
    const seoTheme = merged.themes.find((t) => t.category === 'seo');

    expect(accessibilityTheme?.legalRelevance).toBe('WCAG 2.2 1.4.3');
    expect(seoTheme?.legalRelevance).toBeUndefined();
  });

  it('carries structure-decided fields and writing-decided prose onto the same theme', () => {
    const merged = mergeAnalysisPasses(buildStructureDoc(), buildWritingOutput());
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

    expect(() => mergeAnalysisPasses(buildStructureDoc(), writingOutput)).toThrow(/merge invariant violated/);
  });
});
