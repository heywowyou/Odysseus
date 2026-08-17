import { describe, expect, it } from 'vitest';
import { renderStatistics } from './statistics.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderStatistics against the real sas-fernande.fr scan', () => {
  it('renders the real page count, finding count, and severity breakdown', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('fr'), 'fr', findings, manifest);

    // 11 pages, 78 findings, 61 minor (docs/normalization-rules.md section 7).
    expect(html).toContain('>11</div>');
    expect(html).toContain('>78</div>');
    expect(html).toContain('>61</div>');
    expect(html).toContain('Mineur'); // severity label, doc §3 canonical map
  });

  it('renders the wide WCAG-fail-count paragraph with the real pages-affected count filled in', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('en'), 'en', findings, manifest);

    expect(html).not.toContain('{pages}');
    expect(html).toMatch(/WCAG 2\.2 AA criteria failing across \d+ pages/);
  });

  it('renders exactly 4 number tiles, 4 severity tiles, and 5 category tiles (doc §3 section 03 cap, plus geo added milestone 8.5c)', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('fr'), 'fr', findings, manifest);

    expect((html.match(/font-size:28px/g) ?? []).length).toBe(4);
    expect((html.match(/font-size:24px/g) ?? []).length).toBe(4);
    expect((html.match(/font-size:22px/g) ?? []).length).toBe(5);
  });
});
