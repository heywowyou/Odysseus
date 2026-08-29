import { describe, expect, it } from 'vitest';
import { buildOutreachFactsBlock } from '@odysseus/core';
import { lintOutreachPreviewHtml } from './preview-lint.js';
import { generateOutreachPreviewHtml } from './render-html.js';
import { previewTestImage, previewTestInput } from './test-fixtures.js';

const LANGUAGES = ['fr', 'en'] as const;

describe('lintOutreachPreviewHtml', () => {
  describe('each rule fires on a crafted document', () => {
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

  // Without this, a pattern broad enough to reject every document would look
  // like the strictest possible safety and would in fact make the lint useless.
  it.each(LANGUAGES)('passes the real rendered %s document', (language) => {
    const html = generateOutreachPreviewHtml(
      previewTestInput({
        language,
        facts: buildOutreachFactsBlock({
          assessment: undefined,
          language,
          capabilities: { argumentB: true },
        }),
        images: [previewTestImage({ kind: 'render-comparison' }), previewTestImage()],
      }),
    );
    expect(lintOutreachPreviewHtml(html)).toBeNull();
  });

  it('does not mistake the document stylesheet for a selector in the prose', () => {
    // The stylesheet legitimately contains `.observations li` and `a:focus-visible`;
    // stripping <style> before the text guard is what keeps that from firing.
    const html = generateOutreachPreviewHtml(previewTestInput());
    expect(html).toContain('.observations li');
    expect(lintOutreachPreviewHtml(html)).toBeNull();
  });

  it('does not mistake a base64 image payload for prose', () => {
    const html = generateOutreachPreviewHtml(previewTestInput({ images: [previewTestImage()] }));
    expect(html).toContain('data:image/png;base64,');
    expect(lintOutreachPreviewHtml(html)).toBeNull();
  });
});
