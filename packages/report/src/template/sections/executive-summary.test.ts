import { describe, expect, it } from 'vitest';
import { renderExecutiveSummary } from './executive-summary.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeAnalysis } from '../../test-fixtures.js';

describe('renderExecutiveSummary against the real sas-fernande.fr analysis', () => {
  it('references the top 3 themes by rank and title, without restating businessImpact (B14)', async () => {
    const analysis = await loadSasFernandeAnalysis('fr');
    const html = renderExecutiveSummary(getStrings('fr'), analysis);

    const sorted = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank);
    const top3 = sorted.slice(0, 3);

    for (const theme of top3) {
      expect(html).toContain(`Voir priorité ${theme.priorityRank}.`);
    }
    // businessImpact prose must not be duplicated into this block - it
    // already appears once, in the theme card itself.
    for (const theme of top3) {
      const impactSnippet = theme.businessImpact.slice(0, 30);
      const occurrences = html.split(impactSnippet).length - 1;
      expect(occurrences).toBeLessThanOrEqual(0);
    }
  });

  it('lists only quick-win themes (low effort, non-low impact) in the quick-wins strip', async () => {
    const analysis = await loadSasFernandeAnalysis('fr');
    const html = renderExecutiveSummary(getStrings('fr'), analysis);

    const quickWinRanks = analysis.themes
      .filter((t) => t.effort === 'low' && t.impact !== 'low')
      .map((t) => t.priorityRank);

    if (quickWinRanks.length > 0) {
      expect(html).toContain('class="qwin"');
      for (const rank of quickWinRanks) {
        expect(html).toContain(String(rank));
      }
    } else {
      expect(html).not.toContain('class="qwin"');
    }
  });

  it('renders the LLM executive summary prose verbatim (escaped)', async () => {
    const analysis = await loadSasFernandeAnalysis('en');
    const html = renderExecutiveSummary(getStrings('en'), analysis);

    expect(html).toContain(analysis.executiveSummary.slice(0, 30));
  });
});
