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
    expect(html).toContain('<b>11</b>');
    expect(html).toContain('<b>78</b>');
    expect(html).toContain('<b><span class="glyph">&#9675;</span>61</b>');
  });

  it('renders the wide WCAG tile description with the real pages-affected count filled in', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('en'), 'en', findings, manifest);

    expect(html).not.toContain('{pages}');
    expect(html).toMatch(/WCAG 2\.2 AA criteria failing across \d+ pages/);
  });
});
