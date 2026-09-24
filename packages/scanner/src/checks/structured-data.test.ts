import { describe, expect, it } from 'vitest';
import { evaluateStructuredData } from './structured-data.js';
import { extractSchemaItems, withoutStrayQuotedAttributes } from './structured-data-extract.js';

function htmlWithJsonLd(jsonLd: Record<string, unknown> | Record<string, unknown>[]): string {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

const COMPLETE_ARTICLE = {
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
};

describe('evaluateStructuredData', () => {
  it('reports no schemas and no failures for a page with no structured data at all', async () => {
    const result = await evaluateStructuredData(
      '<!doctype html><html><head></head><body>Hello</body></html>',
    );
    expect(result.schemasFound).toEqual([]);
    expect(result.failedTests).toEqual([]);
  });

  it('does not treat recommended Article fields as required', async () => {
    const result = await evaluateStructuredData(
      htmlWithJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'A headline with nothing else required',
      }),
    );

    expect(result.schemasFound).toContain('Article');
    expect(result.failedTests).toEqual([]);
  });

  it('reports no failures for a complete Article schema', async () => {
    const result = await evaluateStructuredData(htmlWithJsonLd(COMPLETE_ARTICLE));

    expect(result.schemasFound).toContain('Article');
    expect(result.failedTests).toEqual([]);
  });

  it('treats declared but empty required fields as missing', async () => {
    const result = await evaluateStructuredData(
      htmlWithJsonLd({
        '@context': 'https://schema.org',
        '@type': 'ClaimReview',
        reviewRating: {},
        claimReviewed: '   ',
      }),
    );

    const failed = result.failedTests.map((test) => test.test);
    expect(failed).toContain('ClaimReview[0].reviewRating');
    expect(failed).toContain('ClaimReview[0].claimReviewed');
  });

  // A type Google recognizes but asks nothing mandatory of must be reported as
  // present and must never produce a finding - the old library's WebPage and
  // Organization presets marked every field optional for the same reason.
  it('reports a schema with no required fields without ever failing it', async () => {
    const result = await evaluateStructuredData(
      htmlWithJsonLd({ '@context': 'https://schema.org', '@type': 'Organization' }),
    );

    expect(result.schemasFound).toEqual(['Organization']);
    expect(result.failedTests).toEqual([]);
  });

  it('indexes each item of the same schema separately', async () => {
    const result = await evaluateStructuredData(
      htmlWithJsonLd([
        COMPLETE_ARTICLE,
        { '@context': 'https://schema.org', '@type': 'Article', headline: 'Second' },
      ]),
    );

    expect(result.failedTests).toEqual([]);
  });

  // The one real-site occurrence of this rule in the repository's own saved
  // audits (haaitza.com) was microdata, not JSON-LD, so microdata support is
  // what the finding actually rests on.
  it('validates a microdata item the same way as a JSON-LD one', async () => {
    const html = `<!doctype html><html><body>
      <article itemscope itemtype="https://schema.org/BlogPosting">
        <meta itemprop="datePublished" content="2026-08-01">
        <h1 itemprop="headline">A post</h1>
      </article>
    </body></html>`;

    const result = await evaluateStructuredData(html);

    expect(result.schemasFound).toEqual(['BlogPosting']);
    expect(result.failedTests).toEqual([]);
  });

  it('lists a schema once per markup form it is declared in', async () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify(COMPLETE_ARTICLE)}</script>
    </head><body>
      <article itemscope itemtype="https://schema.org/Article"><h1 itemprop="headline">A</h1></article>
    </body></html>`;

    const result = await evaluateStructuredData(html);

    expect(result.schemasFound).toEqual(['Article', 'Article']);
    // The complete JSON-LD copy passes; only the microdata copy fails.
    expect(result.failedTests.every((test) => test.type === 'microdata')).toBe(true);
  });

  it('ignores a JSON-LD block that is not valid JSON rather than throwing', async () => {
    const html =
      '<!doctype html><html><head><script type="application/ld+json">{ not json </script></head><body></body></html>';

    expect(await evaluateStructuredData(html)).toEqual({ schemasFound: [], failedTests: [] });
  });

  it('resolves same-page @id references across a Yoast graph', async () => {
    const result = await evaluateStructuredData(
      htmlWithJsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@id': 'https://example.com/article#article',
            '@type': 'Article',
            publisher: { '@id': 'https://example.com/#organization' },
          },
          {
            '@id': 'https://example.com/#organization',
            '@type': 'Organization',
            name: 'Example',
            address: '1 Main Street',
            telephone: '+33123456789',
          },
        ],
      }),
    );

    expect(result.failedTests).toEqual([]);
  });
});

describe('extractSchemaItems', () => {
  it('reads a nested microdata item as a property of its parent, not as its own item', async () => {
    const html = `<!doctype html><html><body>
      <article itemscope itemtype="https://schema.org/Article">
        <h1 itemprop="headline">A post</h1>
        <div itemprop="publisher" itemscope itemtype="https://schema.org/Organization">
          <span itemprop="name">Example Publisher</span>
          <div itemprop="logo" itemscope itemtype="https://schema.org/ImageObject">
            <link itemprop="url" href="https://example.com/logo.png">
          </div>
        </div>
      </article>
    </body></html>`;

    const items = await extractSchemaItems(html);

    expect(items).toHaveLength(1);
    expect(items[0]?.schema).toBe('Article');
    expect(items[0]?.properties).toMatchObject({
      headline: 'A post',
      publisher: {
        '@type': 'Organization',
        name: 'Example Publisher',
        logo: { '@type': 'ImageObject', url: 'https://example.com/logo.png' },
      },
    });
  });

  it('reads RDFa items', async () => {
    const html = `<!doctype html><html><body>
      <div typeof="Article"><span property="headline">An RDFa post</span></div>
    </body></html>`;

    const items = await extractSchemaItems(html);

    expect(items).toEqual([
      {
        markup: 'rdfa',
        schema: 'Article',
        properties: { '@type': 'Article', headline: 'An RDFa post' },
      },
    ]);
  });

  it('unwraps @graph containers', async () => {
    const html = htmlWithJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Home' },
        { '@type': 'Organization', name: 'Acme' },
      ],
    });

    expect((await extractSchemaItems(html)).map((item) => item.schema)).toEqual([
      'WebPage',
      'Organization',
    ]);
  });

  it('indexes an item declaring several types under each of them', async () => {
    const html = htmlWithJsonLd({
      '@context': 'https://schema.org',
      '@type': ['Article', 'BlogPosting'],
      headline: 'Both',
    });

    expect((await extractSchemaItems(html)).map((item) => item.schema)).toEqual([
      'Article',
      'BlogPosting',
    ]);
  });

  it('accepts the three ways a type is written', async () => {
    for (const declared of ['https://schema.org/Article', 'http://schema.org/Article', 'Article']) {
      const html = `<!doctype html><html><body><div itemscope itemtype="${declared}"></div></body></html>`;
      expect((await extractSchemaItems(html)).map((item) => item.schema)).toEqual(['Article']);
    }
  });
});

describe('markup browsers accept but the tokenizer does not', () => {
  // Grand Hôtel des Alpes and Grand Hôtel Opéra: a stray quote in an icon's
  // markup, serialized by the browser as an attribute named `"`, threw in the
  // tokenizer and lost the whole page's structured data.
  it('still reads the JSON-LD of a page with a stray quoted attribute', async () => {
    const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Hotel","name":"Grand Hôtel"}</script></head><body><i class="icon" "="" title="t"></i><a href="/x" ",="" rel="n">x</a></body></html>`;
    const items = await extractSchemaItems(html);
    expect(items.map((item) => item.schema)).toEqual(['Hotel']);
  });

  it('leaves quoted text inside an attribute value alone', () => {
    const html = '<p title="a &quot;=&quot;&quot; b">x "="" y</p>';
    expect(withoutStrayQuotedAttributes(html)).toBe(html);
  });
});
