/**
 * B2/B6: the caption never fills a missing selector with a bare hyphen,
 * and an empty evidence list renders a positive statement rather than
 * nothing.
 */
import { describe, expect, it } from 'vitest';
import { renderRenderDiffEvidence } from './render-diff-evidence.js';
import { fr } from '../strings/fr.js';

describe('renderRenderDiffEvidence', () => {
  it('drops the "sur {selector}" clause instead of rendering "sur -." when no selector is known (B2)', () => {
    const html = renderRenderDiffEvidence(
      fr,
      'fr',
      [{ pageUrl: 'https://example.com/', missingPercent: 12, rawTextLength: null, renderedTextLength: null, selector: '' }],
      1,
    );

    expect(html).not.toContain('-.');
    expect(html).toContain('Manquant : 12% du texte visible absent du HTML brut.');
  });

  it('still renders the full sentence when a selector is known', () => {
    const html = renderRenderDiffEvidence(
      fr,
      'fr',
      [{ pageUrl: 'https://example.com/', missingPercent: 40, rawTextLength: 10, renderedTextLength: 100, selector: '.hero' }],
      1,
    );

    expect(html).toContain('Manquant : 40% du texte visible absent du HTML brut, sur .hero.');
  });

  it('renders a positive statement, not an empty section, when there is nothing to show (B6)', () => {
    const html = renderRenderDiffEvidence(fr, 'fr', [], 0, 0);

    expect(html).toContain('conservent leur texte dans le HTML brut');
    expect(html).not.toContain("d&#39;intégration de contenu tiers font exception");
  });

  it('names wrapper/legal pages as the exception when some were excluded (B6)', () => {
    const html = renderRenderDiffEvidence(fr, 'fr', [], 0, 2);

    expect(html).toContain('conservent leur texte dans le HTML brut');
    expect(html).toContain("d&#39;intégration de contenu tiers font exception");
  });
});
