import { describe, expect, it } from 'vitest';
import { renderFindingsAppendix } from './findings-appendix.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

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
 * Both halves are asserted here: fixed layout so every fragment lays out
 * identically, and nowrap so an id can never break even if a future change
 * squeezes the column again.
 */
describe('2026-08-24: annex finding ids never break mid-token across a page fragment', () => {
  async function render(): Promise<string> {
    const [findings, manifest] = await Promise.all([
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);
    return renderFindingsAppendix(getStrings('fr'), 9, 'fr', findings, manifest, 'general');
  }

  it('lays the annex tables out with fixed column widths', async () => {
    const html = await render();
    const tables = html.match(/<table[^>]*>/gu) ?? [];
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(table).toContain('table-layout:fixed');
  });

  it('renders every finding id cell as nowrap, never overflow-wrap:anywhere', async () => {
    const html = await render();
    const idCells = html.match(/<td[^>]*>f\d{3}<\/td>/gu) ?? [];
    expect(idCells.length).toBeGreaterThan(0);
    for (const cell of idCells) {
      expect(cell).toContain('white-space:nowrap');
      expect(cell).not.toContain('overflow-wrap:anywhere');
    }
  });
});
