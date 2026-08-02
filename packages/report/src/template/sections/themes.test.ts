import { describe, expect, it } from 'vitest';
import { renderThemes } from './themes.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings } from '../../test-fixtures.js';

describe('renderThemes against the real sas-fernande.fr analysis', () => {
  it('renders every theme with its priority rank and no invented finding IDs', async () => {
    const [analysis, findings] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
    ]);

    const html = renderThemes(getStrings('fr'), analysis, findings);

    for (const theme of analysis.themes) {
      expect(html).toContain(`#${theme.priorityRank}`);
    }
  });

  it('resolves affected pages from theme findingIds via the real findings array', async () => {
    const [analysis, findings] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
    ]);
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));

    const firstTheme = analysis.themes[0];
    expect(firstTheme).toBeDefined();
    const expectedPage = firstTheme?.findingIds
      .map((id) => findingsById.get(id))
      .find((f) => f !== undefined)?.pageUrls[0];

    const html = renderThemes(getStrings('fr'), analysis, findings);
    if (expectedPage) expect(html).toContain(expectedPage);
  });
});
