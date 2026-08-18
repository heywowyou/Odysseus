import { describe, expect, it } from 'vitest';
import { renderChecklist } from './checklist.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

// item 35: the printable checklist was a near-exact restatement of the
// priorities section with nothing added - same three items, same effort/
// impact labels, same page counts. Now carries finding IDs, WCAG
// criteria, and a blank status/date column so it functions as an actual
// working checklist.
describe('item 35: the checklist carries finding IDs, WCAG criteria, and a blank status/date column', () => {
  it('renders each rendered theme\'s finding IDs', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    for (const theme of analysis.themes.slice(0, 6)) {
      expect(html).toContain(theme.findingIds[0]!);
    }
  });

  it('renders the WCAG criteria column header and a blank status/date column header', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).toContain('WCAG');
    expect(html).toContain('Statut / Date');
  });

  it('is no longer identical to a bare rank/title/effort/impact/pages table', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).toContain('Constats');
    expect(html).toContain('mono');
  });
});
