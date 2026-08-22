import { describe, expect, it } from 'vitest';
import { evaluateStructuredData } from './structured-data.js';

function htmlWithJsonLd(jsonLd: Record<string, unknown>): string {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

describe('evaluateStructuredData', () => {
  it('reports no schemas and no failures for a page with no structured data at all', async () => {
    const result = await evaluateStructuredData('<!doctype html><html><head></head><body>Hello</body></html>');
    expect(result.schemasFound).toEqual([]);
    expect(result.failedTests).toEqual([]);
  });

  it('flags missing required fields for an incomplete Article schema', async () => {
    const html = htmlWithJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'A headline with nothing else required',
    });

    const result = await evaluateStructuredData(html);

    expect(result.schemasFound).toContain('Article');
    expect(result.failedTests.length).toBeGreaterThan(0);
    expect(result.failedTests.every((test) => test.schema === 'Article')).toBe(true);
  });

  it('reports no failures for a complete Article schema', async () => {
    const html = htmlWithJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'A complete article',
      author: { '@type': 'Person', name: 'Jane Doe' },
      datePublished: '2026-08-01',
      image: 'https://example.com/image.jpg',
      publisher: {
        '@type': 'Organization',
        name: 'Example Publisher',
        logo: { '@type': 'ImageObject', url: 'https://example.com/logo.png' },
      },
    });

    const result = await evaluateStructuredData(html);

    expect(result.schemasFound).toContain('Article');
    expect(result.failedTests).toEqual([]);
  });
});
