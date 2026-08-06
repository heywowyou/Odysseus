import { describe, expect, it } from 'vitest';
import { renderMethodology } from './methodology.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderMethodology against the real sas-fernande.fr manifest', () => {
  it('states the crawl size (B16) and tool versions in one merged section, no separate limitations section', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('fr'), manifest, 'fr');

    // 11 pages, docs/normalization-rules.md section 7.
    expect(html).toContain('11 pages explorées');
    expect(html).toContain(manifest.tool.axeCoreVersion ?? '');
    expect(html).toContain(manifest.tool.lighthouseVersion ?? '');
    // The automated-coverage caveat used to be duplicated across two
    // sections (B15) - now appears exactly once.
    const occurrences = html.split('30 et 40 pour cent').length - 1;
    expect(occurrences).toBe(1);
  });

  it('renders in English without leaking French', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderMethodology(getStrings('en'), manifest, 'en');

    expect(html).toContain('11 pages crawled');
    expect(html).not.toContain('explorées');
  });
});
