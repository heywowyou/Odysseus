import { describe, expect, it } from 'vitest';
import { lintOutreachPreviewHtml } from './preview-lint.js';
import { generateOutreachPreviewHtmlV3 } from './render-html-v3.js';
import { previewSummaryV3 } from './test-fixtures.js';

const LANGUAGES = ['fr', 'en'] as const;

describe('lintOutreachPreviewHtml', () => {
  describe('each universal rule fires on a crafted document', () => {
    it.each([
      ['script-element', '<p>ok</p><script>alert(1)</script>'],
      ['iframe', '<iframe src="x"></iframe>'],
      ['inline-event-handler', '<div onclick="go()">x</div>'],
      ['insecure-url', '<p>see http://example.com</p>'],
      ['remote-asset', '<img src="https://cdn.example.com/a.png">'],
      ['form', '<form action="/x"></form>'],
      ['reference-stat-source', '<p>according to WebAIM</p>'],
      ['percentage', '<p>34% of visitors leave</p>'],
      ['legal-conclusion', '<p>you must fix this</p>'],
      ['sanction', '<p>une amende peut suivre</p>'],
      ['currency-amount', '<p>EUR 45,000</p>'],
    ])('fires %s', (rule, html) => {
      expect(lintOutreachPreviewHtml(html)).toBe(rule);
    });
  });

  describe('Plan 046 French v2 editorial rules', () => {
    it.each([
      [
        'editorial-internal-tool-vocabulary',
        '<html lang="fr"><body><p>Cette note mesure les constats des scanners.</p></body></html>',
      ],
      [
        'editorial-internal-tool-vocabulary',
        '<html lang="fr"><body><p>Notre robot parcourt votre site.</p></body></html>',
      ],
      [
        'editorial-defensive-formulation',
        '<html lang="fr"><body><p>Rien n’est inventé, rien n’est deviné.</p></body></html>',
      ],
      ['editorial-legacy-severity', '<html lang="fr"><body><p>Grave</p></body></html>'],
      [
        'editorial-sentence-fragment',
        '<html lang="fr"><body><p>Choisis parmi les plus graves et les plus répandus.</p></body></html>',
      ],
    ])('fires %s', (rule, html) => {
      expect(lintOutreachPreviewHtml(html, { editorialV2: true })).toBe(rule);
    });
  });

  it('does not apply the French editorial vocabulary rules to English during the French-first phase', () => {
    const html = '<html lang="en"><body><p>This grade measures scanner findings.</p></body></html>';
    expect(lintOutreachPreviewHtml(html, { editorialV2: true })).toBeNull();
  });

  // Without this, a pattern broad enough to reject every document would look
  // like the strictest possible safety and would in fact make the lint useless.
  it.each(LANGUAGES)('passes the real rendered %s document', (language) => {
    const html = generateOutreachPreviewHtmlV3(previewSummaryV3({ language }));
    expect(lintOutreachPreviewHtml(html)).toBeNull();
  });

  it('does not mistake the document stylesheet for a selector in the prose', () => {
    // The stylesheet legitimately contains `a:focus-visible`; stripping
    // <style> before the text guard is what keeps that from firing.
    const html = generateOutreachPreviewHtmlV3(previewSummaryV3());
    expect(html).toContain('a:focus-visible');
    expect(lintOutreachPreviewHtml(html)).toBeNull();
  });

  it('does not mistake a base64 image payload for prose', () => {
    const html =
      '<html lang="fr"><body><p>Un constat.</p>' +
      '<img alt="" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="></body></html>';
    expect(lintOutreachPreviewHtml(html)).toBeNull();
  });
});
