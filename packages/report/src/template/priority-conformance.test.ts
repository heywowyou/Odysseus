import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { priorityConformanceCriteria, withPriorityConformance } from './priority-conformance.js';
import { renderChecklist } from './sections/checklist.js';
import { getStrings } from './strings/i18n.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

function variant(base: Finding, patch: Partial<Finding>): Finding {
  return { ...base, ...patch };
}

// Issue #310: a priority grouping hreflang with no-h1 printed "Sans objet"
// on its card while the checklist listed 1.3.1 for the same priority.
describe('issue #310: one conformance computation per priority', () => {
  it('keeps audited A/AA criteria of accessibility findings only, in criterion order', async () => {
    const [base] = await loadSmallSiteFindings();
    const criteria = priorityConformanceCriteria([
      variant(base!, { category: 'seo', wcagCriteria: ['1.1.1'] }),
      variant(base!, { category: 'accessibility', wcagCriteria: ['2.1.3', '1.3.1'] }),
      variant(base!, { category: 'accessibility', wcagCriteria: ['1.3.1', '1.2.2'] }),
    ]);
    expect(criteria).toEqual(['1.2.2', '1.3.1']);
  });

  it('gives a mixed SEO priority the same criteria on its card and in the checklist', async () => {
    const [findings, manifest, stored] = await Promise.all([
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const seoFinding = variant(findings[0]!, {
      findingId: 'hreflang-issue310',
      category: 'seo',
      ruleId: 'hreflang',
      wcagCriteria: [],
    });
    const headingFinding = variant(findings[0]!, {
      findingId: 'no-h1-issue310',
      category: 'accessibility',
      ruleId: 'no-h1',
      wcagCriteria: ['1.3.1'],
    });
    const allFindings = [...findings, seoFinding, headingFinding];
    const [firstTheme, ...otherThemes] = stored.themes;
    const mixedTheme = {
      ...firstTheme!,
      title: 'Priorité mixte issue 310',
      priorityRank: 1,
      category: 'seo' as const,
      findingIds: [seoFinding.findingId, headingFinding.findingId],
      legalRelevance: undefined,
    };
    const analysis = withPriorityConformance(
      { ...stored, themes: [mixedTheme, ...otherThemes] },
      allFindings,
    );

    expect(analysis.themes[0]!.legalRelevance).toContain('1.3.1');

    const checklist = renderChecklist(getStrings('fr'), 5, 'fr', analysis, allFindings, manifest);
    const row = checklist
      .split('<div class="row-atomic">')
      .find((chunk) => chunk.includes('Priorité mixte issue 310'));
    expect(row).toContain('1.3.1');
  });

  it('drops a stored sentence when the priority carries no audited criterion', async () => {
    const [findings, stored] = await Promise.all([
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('en'),
    ]);
    const seoOnly = variant(findings[0]!, {
      findingId: 'seo-only-issue310',
      category: 'seo',
      wcagCriteria: ['1.1.1'],
    });
    const analysis = withPriorityConformance(
      {
        ...stored,
        themes: [{ ...stored.themes[0]!, findingIds: [seoOnly.findingId], legalRelevance: 'x' }],
      },
      [seoOnly],
    );
    expect(analysis.themes[0]).not.toHaveProperty('legalRelevance');
  });
});
