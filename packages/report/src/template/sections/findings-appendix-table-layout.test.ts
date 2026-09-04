import { describe, expect, it } from 'vitest';
import { renderFindingsAppendix } from './findings-appendix.js';
import { getStrings } from '../strings/i18n.js';
import { loadSmallSiteFindings, loadSmallSiteManifest } from '../../test-fixtures.js';

/**
 * 2026-08-24, Palais Gallien re-scan review. A rule group split across a
 * page break rendered its finding ids as "f05" on one line and "2" on the
 * next, from page 20 of a real 29-page PDF onwards. Root cause was not the
 * id cell alone: the table used the default auto layout, so the per-column
 * widths declared on the header cells were only hints and Paged.js
 * recomputed them for each fragment. The continuation fragment's own
 * longest selector squeezed the id column below its content width, and the
 * id cell's overflow-wrap:anywhere then broke the id mid-token.
 *
 * Both halves are asserted here: every fragment lays out identically, and
 * nowrap so an id can never break even if a future change squeezes the
 * column again.
 *
 * D2 (2026-08-25, Lagnonu review) superseded the first half's mechanism.
 * table-layout:fixed reads its widths from the first row of whatever it is
 * laying out, and Paged.js can open a page on the full-width colspan="4"
 * page-URL row, which declares no columns at all - so continuation pages
 * still fell back to distributing the width equally. Measured on a real
 * 38-page report: the selector column began at x~325 on the page carrying
 * the header and x~530 on every page after it, and 52 selectors wrapped
 * mid-token as a result.
 *
 * The fix is to declare the widths where every fragment can see them - a
 * colgroup, plus the width on each cell - which auto layout honours across
 * all rows where fixed layout consults only the first. Same measurement
 * after the change: 0 mid-token selector breaks, and page 17 lays out
 * identically to page 16. The original defect stays covered by the nowrap
 * assertion below, which is what actually guarantees an id is never split.
 */
describe('2026-08-24: annex finding ids never break mid-token across a page fragment', () => {
  async function render(): Promise<string> {
    const [findings, manifest] = await Promise.all([
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    return renderFindingsAppendix(getStrings('fr'), 9, 'fr', findings, manifest, 'general');
  }

  it('declares column widths where a continuation fragment can still see them', async () => {
    const html = await render();
    const tables = html.match(/<table[^>]*>/gu) ?? [];
    expect(tables.length).toBeGreaterThan(0);

    // A colgroup applies to the table regardless of which row leads a
    // fragment, which is exactly what a header-only declaration did not.
    const colgroups = html.match(/<colgroup>.*?<\/colgroup>/gu) ?? [];
    expect(colgroups.length).toBe(tables.length);
    for (const colgroup of colgroups) {
      expect(colgroup.match(/<col /gu) ?? []).toHaveLength(4);
    }
  });

  it('gives every finding row its own column widths, not just the header row', async () => {
    const html = await render();
    // Issue #45 moved each finding's four cells into a per-row grid inside
    // one atomic colspan="4" row (so a finding can never be split from its
    // own continuation lines). The grid repeats the colgroup's widths, so
    // every finding row still lays out identically to the header's columns
    // wherever a fragment lands.
    const rowGrids = html.match(/display:grid;grid-template-columns:80px 90px 100px auto/gu) ?? [];
    const findingRows = html.match(/id="annexref-/gu) ?? [];
    expect(findingRows.length).toBeGreaterThan(0);
    expect(rowGrids).toHaveLength(findingRows.length);
  });

  it('renders every finding id cell as nowrap, never overflow-wrap:anywhere', async () => {
    const html = await render();
    const idCells =
      html.match(
        /<div style="font-family:ui-monospace,monospace;white-space:nowrap">f\d{3}<\/div>/gu,
      ) ?? [];
    expect(idCells.length).toBeGreaterThan(0);
    for (const cell of idCells) {
      expect(cell).toContain('white-space:nowrap');
      expect(cell).not.toContain('overflow-wrap:anywhere');
    }
  });

  // Issue #45: the atomic row carries the guarantee inline as well, so it
  // is declared where the rows are built and does not depend on the
  // stylesheet rule alone.
  it('renders each finding as one atomic row that can never split from its continuation lines', async () => {
    const html = await render();
    const rows = html.match(/<tr id="annexref-[^"]*" style="break-inside:avoid">/gu) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    // No finding renders a separate continuation <tr> that could be
    // stranded alone at a page top: the Fichiers/Pages lines live inside
    // the finding's own single <td colspan="4">.
    expect(html).not.toContain('appendix-url-row');
    expect(html).not.toContain('colspan="4" style="padding:0 var(--space-2) 6px');
    const continuationLines = html.match(/class="url-cell" style="padding-top:6px/gu) ?? [];
    expect(continuationLines.length).toBeGreaterThan(0);
    for (const findingRow of rows) {
      const rowStart = html.indexOf(findingRow);
      const nextRow = html.indexOf('<tr', rowStart + 1);
      const rowHtml = html.slice(rowStart, nextRow === -1 ? undefined : nextRow);
      expect(rowHtml).toContain('<td colspan="4"');
    }
  });
});
