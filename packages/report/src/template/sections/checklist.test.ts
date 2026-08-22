import { describe, expect, it } from 'vitest';
import { renderChecklist } from './checklist.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

// item 35: the printable checklist was a near-exact restatement of the
// priorities section with nothing added - same three items, same effort/
// impact labels, same page counts. Now carries finding IDs and WCAG
// criteria so it functions as an actual working checklist.
describe('item 35: the checklist carries finding IDs and WCAG criteria', () => {
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

  it('renders the WCAG criteria column header', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).toContain('WCAG');
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

// item 2.7: a trailing "Statut / Date" column rendered as a bare
// underline with no visible boundary in a narrow cell, reading as a stray
// dash rather than a writable field - removed rather than restyled.
describe('item 2.7: the checklist has no stray status/date column, and carries a company/date identifier instead', () => {
  it('renders no "Statut / Date" column header', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).not.toContain('Statut / Date');
  });

  it('renders the site as an identifier line, so the page is identifiable once printed alone', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).toContain(manifest.siteUrl);
  });
});

// 2026-08-22, La Corniche report review: the checklist's Impact column
// used to render as plain text, identical in weight to Effort. The
// coloured value must survive as a <span data-level="..."> rather than
// on the row's own <div> cell, since paged.css's #section-05 print
// override forces every div's color to a light-mode value with
// !important - only an element outside that selector list (a span) can
// carry its own colour through to the printed PDF.
describe('2026-08-22: the checklist Impact column is colour-coded via a data-level span, Effort is not', () => {
  it('wraps each row\'s Impact value in a data-level span with LEVEL_COLOR, distinct from the plain Effort cell', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    const firstTheme = analysis.themes.slice(0, 6).find((t) => t.impact) ?? analysis.themes[0]!;
    expect(html).toMatch(new RegExp(`data-level="${firstTheme.impact}" style="color:#[0-9a-f]{6}"`));
  });
});
