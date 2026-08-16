import { describe, expect, it } from 'vitest';
import { renderExecutiveSummary } from './executive-summary.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeAnalysis } from '../../test-fixtures.js';

describe('renderExecutiveSummary against the real sas-fernande.fr analysis', () => {
  it('references the top 3 themes by rank and title as jump links, capped at 3 (doc §3 section 01)', async () => {
    const analysis = await loadSasFernandeAnalysis('fr');
    const html = renderExecutiveSummary(getStrings('fr'), analysis);

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
    const html = renderExecutiveSummary(getStrings('en'), analysis);

    expect(html).toContain(analysis.executiveSummary.slice(0, 30));
  });
});
