import { describe, expect, it } from 'vitest';
import { renderExecutiveSummary } from './executive-summary.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeAnalysis } from '../../test-fixtures.js';

describe('renderExecutiveSummary against the real sas-fernande.fr analysis', () => {
  it('references the top 3 themes by rank and title, without restating businessImpact (B14)', async () => {
    const analysis = await loadSasFernandeAnalysis('fr');
    const html = renderExecutiveSummary(getStrings('fr'), analysis, 'full');

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
    const html = renderExecutiveSummary(getStrings('fr'), analysis, 'full');

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
    const html = renderExecutiveSummary(getStrings('en'), analysis, 'full');

    expect(html).toContain(analysis.executiveSummary.slice(0, 30));
  });
});

describe('renderExecutiveSummary, screening tier', () => {
  it('suppresses "what to do first" and the quick-wins strip, which both reference themes this tier never renders', async () => {
    const analysis = await loadSasFernandeAnalysis('en');
    const html = renderExecutiveSummary(getStrings('en'), analysis, 'screening');

    expect(html).not.toContain('See priority');
    expect(html).not.toContain('class="qwin"');
    // The prose summary itself still renders.
    expect(html).toContain(analysis.executiveSummary.slice(0, 30));
  });
});
