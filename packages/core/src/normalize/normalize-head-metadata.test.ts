import { describe, expect, it } from 'vitest';
import {
  extractHeadMetadataCandidates,
  META_TITLE_LENGTH_RULE_ID,
  META_DESCRIPTION_LENGTH_RULE_ID,
  CANONICAL_CONFLICTING_RULE_ID,
  CANONICAL_MISSING_RULE_ID,
  JSONLD_MISSING_RULE_ID,
  JSONLD_INVALID_RULE_ID,
  HEADING_HIERARCHY_SKIP_RULE_ID,
  MULTIPLE_H1_RULE_ID,
  NO_H1_RULE_ID,
  OPENGRAPH_MISSING_RULE_ID,
  NOINDEX_ON_PUBLIC_PAGE_RULE_ID,
  META_DESCRIPTION_MISSING_RULE_ID,
  lighthouseAuditsCoveredByHeadMetadata,
  type HeadMetadataCheckInput,
} from './normalize-head-metadata.js';

const PAGE_URL = 'https://example.com/';

function baseInput(overrides: Partial<HeadMetadataCheckInput> = {}): HeadMetadataCheckInput {
  return {
    pageUrl: PAGE_URL,
    title: 'A perfectly reasonable page title for SEO',
    metaDescription:
      'A meta description of a completely reasonable length that sits comfortably within the recommended SERP display range for search engines.',
    canonicalUrls: [PAGE_URL],
    openGraphTags: {
      'og:title': 'Title',
      'og:description': 'Description',
      'og:image': 'https://example.com/img.png',
    },
    jsonLdBlocks: [
      { raw: '{"@context":"https://schema.org","@type":"WebPage"}', selector: '#ld1', parsed: {} },
    ],
    headings: [
      { level: 1, text: 'Main heading', selector: 'h1:nth-of-type(1)' },
      { level: 2, text: 'Sub heading', selector: 'h2:nth-of-type(1)' },
    ],
    hreflangLinks: [],
    robotsMeta: null,
    ...overrides,
  };
}

function ruleIds(candidates: ReturnType<typeof extractHeadMetadataCandidates>): string[] {
  return candidates.map((c) => c.ruleId);
}

describe('extractHeadMetadataCandidates - clean page regression', () => {
  it('emits nothing for a well-formed page', () => {
    expect(extractHeadMetadataCandidates(baseInput())).toEqual([]);
  });

  // A missing title stays axe's (document-title). A missing description
  // was left to Lighthouse until it started running on a sample of pages
  // (trade-off 110), so it is reported here now.
  it('emits nothing for a missing title, which axe reports', () => {
    expect(extractHeadMetadataCandidates(baseInput({ title: null }))).toEqual([]);
  });
});

describe('meta-title-length', () => {
  it('fires when the title is too short', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ title: 'Short' }));
    expect(ruleIds(candidates)).toEqual([META_TITLE_LENGTH_RULE_ID]);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('minor');
    expect(candidates[0]?.element).toBeNull();
  });

  it('fires when the title is too long', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ title: 'A'.repeat(100) }));
    expect(ruleIds(candidates)).toEqual([META_TITLE_LENGTH_RULE_ID]);
  });

  it('does not fire within the recommended range', () => {
    expect(extractHeadMetadataCandidates(baseInput({ title: 'A'.repeat(45) }))).toEqual([]);
  });
});

describe('meta-description-length', () => {
  it('fires when the description is too short', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ metaDescription: 'Too short.' }));
    expect(ruleIds(candidates)).toEqual([META_DESCRIPTION_LENGTH_RULE_ID]);
    expect(candidates[0]?.severity).toBe('minor');
  });

  it('fires when the description is too long', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({ metaDescription: 'A'.repeat(200) }),
    );
    expect(ruleIds(candidates)).toEqual([META_DESCRIPTION_LENGTH_RULE_ID]);
  });
});

describe('canonical-conflicting', () => {
  it('fires when multiple canonical tags point to different URLs', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({ canonicalUrls: ['https://example.com/a', 'https://example.com/b'] }),
    );
    expect(ruleIds(candidates)).toEqual([CANONICAL_CONFLICTING_RULE_ID]);
    expect(candidates[0]?.severity).toBe('serious');
  });

  it('does not fire when multiple canonical tags resolve to the same absolute URL', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({ canonicalUrls: ['https://example.com/', 'https://example.com'] }),
    );
    expect(candidates).toEqual([]);
  });

  it('does not fire for a single canonical tag', () => {
    expect(
      extractHeadMetadataCandidates(baseInput({ canonicalUrls: ['https://example.com/'] })),
    ).toEqual([]);
  });
});

describe('jsonld-missing / jsonld-invalid', () => {
  it('fires jsonld-missing when there are no JSON-LD blocks', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ jsonLdBlocks: [] }));
    expect(ruleIds(candidates)).toEqual([JSONLD_MISSING_RULE_ID]);
    expect(candidates[0]?.severity).toBe('moderate');
  });

  it('fires jsonld-invalid with a real selector when a block fails to parse', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({
        jsonLdBlocks: [
          {
            raw: '{not valid json',
            selector: '#ld1',
            parsed: null,
            parseError: 'Unexpected token',
          },
        ],
      }),
    );
    expect(ruleIds(candidates)).toEqual([JSONLD_INVALID_RULE_ID]);
    expect(candidates[0]?.severity).toBe('serious');
    expect(candidates[0]?.element?.selector).toBe('#ld1');
  });

  it('does not fire either when a block parses cleanly', () => {
    expect(extractHeadMetadataCandidates(baseInput())).toEqual([]);
  });
});

describe('heading-hierarchy-skip / multiple-h1 / no-h1', () => {
  it('fires heading-hierarchy-skip with the skipping heading selector when a level is skipped', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({
        headings: [
          { level: 1, text: 'Main', selector: 'h1:nth-of-type(1)' },
          { level: 4, text: 'Too deep', selector: 'h4:nth-of-type(1)' },
        ],
      }),
    );
    expect(ruleIds(candidates)).toEqual([HEADING_HIERARCHY_SKIP_RULE_ID]);
    expect(candidates[0]?.category).toBe('accessibility');
    expect(candidates[0]?.wcagCriteria).toEqual(['1.3.1']);
    expect(candidates[0]?.element?.selector).toBe('h4:nth-of-type(1)');
  });

  it('does not fire heading-hierarchy-skip for a normal step-down (h1 -> h2 -> h3)', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({
        headings: [
          { level: 1, text: 'Main', selector: 'h1:nth-of-type(1)' },
          { level: 2, text: 'Sub', selector: 'h2:nth-of-type(1)' },
          { level: 3, text: 'Sub sub', selector: 'h3:nth-of-type(1)' },
        ],
      }),
    );
    expect(candidates).toEqual([]);
  });

  it('flags only the initial skip, not a later step back to a shallower level', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({
        headings: [
          { level: 1, text: 'Main', selector: 'h1:nth-of-type(1)' },
          { level: 3, text: 'Deep (skips h2)', selector: 'h3:nth-of-type(1)' },
          { level: 2, text: 'Back to shallower, not a skip', selector: 'h2:nth-of-type(1)' },
        ],
      }),
    );
    expect(ruleIds(candidates)).toEqual([HEADING_HIERARCHY_SKIP_RULE_ID]);
    expect(candidates[0]?.element?.selector).toBe('h3:nth-of-type(1)');
  });

  it('fires multiple-h1 when there is more than one level-1 heading', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({
        headings: [
          { level: 1, text: 'First', selector: 'h1:nth-of-type(1)' },
          { level: 1, text: 'Second', selector: 'h1:nth-of-type(2)' },
        ],
      }),
    );
    expect(ruleIds(candidates)).toEqual([MULTIPLE_H1_RULE_ID]);
    expect(candidates[0]?.severity).toBe('minor');
  });

  it('fires no-h1 when there is no level-1 heading', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({
        headings: [{ level: 2, text: 'Only a sub-heading', selector: 'h2:nth-of-type(1)' }],
      }),
    );
    expect(ruleIds(candidates)).toEqual([NO_H1_RULE_ID]);
    expect(candidates[0]?.severity).toBe('moderate');
  });

  it('fires no-h1 when there are no headings at all', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ headings: [] }));
    expect(ruleIds(candidates)).toEqual([NO_H1_RULE_ID]);
  });

  it('does not fire multiple-h1 or no-h1 for exactly one h1', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({ headings: [{ level: 1, text: 'Main', selector: 'h1:nth-of-type(1)' }] }),
    );
    expect(candidates).toEqual([]);
  });
});

describe('opengraph-missing', () => {
  it('fires when none of the core Open Graph tags are present', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ openGraphTags: {} }));
    expect(ruleIds(candidates)).toEqual([OPENGRAPH_MISSING_RULE_ID]);
    expect(candidates[0]?.severity).toBe('minor');
  });

  it('does not fire when at least one core Open Graph tag is present', () => {
    expect(
      extractHeadMetadataCandidates(baseInput({ openGraphTags: { 'og:title': 'Title' } })),
    ).toEqual([]);
  });

  it('does not fire when unrelated og: tags are present alongside a core one', () => {
    expect(
      extractHeadMetadataCandidates(
        baseInput({ openGraphTags: { 'og:title': 'Title', 'og:locale': 'en_US' } }),
      ),
    ).toEqual([]);
  });
});

describe('noindex-on-public-page', () => {
  it('fires when a non-legal page has a noindex directive', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ robotsMeta: 'noindex, follow' }));
    expect(ruleIds(candidates)).toEqual([NOINDEX_ON_PUBLIC_PAGE_RULE_ID]);
    expect(candidates[0]?.severity).toBe('critical');
    expect(candidates[0]?.category).toBe('seo');
  });

  it('does not fire when the page has no robots meta tag at all', () => {
    expect(extractHeadMetadataCandidates(baseInput({ robotsMeta: null }))).toEqual([]);
  });

  it('does not fire when robots meta is present but does not include noindex', () => {
    expect(extractHeadMetadataCandidates(baseInput({ robotsMeta: 'index, follow' }))).toEqual([]);
  });

  it('does not fire on a page matching the shared legal-path pattern, even with noindex set', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({ pageUrl: 'https://example.com/mentions-legales', robotsMeta: 'noindex' }),
    );
    expect(candidates).toEqual([]);
  });

  it('fires on noindex from a googlebot meta tag', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ googlebotMeta: 'noindex' }));
    expect(ruleIds(candidates)).toEqual([NOINDEX_ON_PUBLIC_PAGE_RULE_ID]);
  });

  it('treats the none directive as noindex', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ robotsMeta: 'none' }));
    expect(ruleIds(candidates)).toEqual([NOINDEX_ON_PUBLIC_PAGE_RULE_ID]);
  });

  it('does not mistake a directive that merely contains noindex', () => {
    expect(extractHeadMetadataCandidates(baseInput({ robotsMeta: 'noindexfoo' }))).toEqual([]);
  });

  it('fires on noindex from the X-Robots-Tag header and names the header', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({ xRobotsTag: 'noindex, nofollow' }),
    );
    expect(ruleIds(candidates)).toEqual([NOINDEX_ON_PUBLIC_PAGE_RULE_ID]);
    expect(candidates[0]?.description).toContain('X-Robots-Tag: noindex, nofollow');
  });

  it('honours a header scoped to googlebot and ignores one scoped to another crawler', () => {
    expect(
      ruleIds(extractHeadMetadataCandidates(baseInput({ xRobotsTag: 'googlebot: noindex' }))),
    ).toEqual([NOINDEX_ON_PUBLIC_PAGE_RULE_ID]);
    expect(
      extractHeadMetadataCandidates(baseInput({ xRobotsTag: 'otherbot: noindex, nofollow' })),
    ).toEqual([]);
  });

  it('does not read a colon directive as a crawler scope', () => {
    expect(
      extractHeadMetadataCandidates(baseInput({ xRobotsTag: 'max-snippet: 50, index' })),
    ).toEqual([]);
  });
});

describe('meta-description-missing', () => {
  it('fires when the page has no meta description', () => {
    const candidates = extractHeadMetadataCandidates(baseInput({ metaDescription: null }));
    expect(ruleIds(candidates)).toEqual([META_DESCRIPTION_MISSING_RULE_ID]);
    expect(candidates[0]?.category).toBe('seo');
  });
});

describe('lighthouseAuditsCoveredByHeadMetadata', () => {
  it('claims nothing for a page without head metadata', () => {
    expect([...lighthouseAuditsCoveredByHeadMetadata(undefined)]).toEqual([]);
  });

  it('claims only the description audit for a scan stored before the link and header facts', () => {
    expect([...lighthouseAuditsCoveredByHeadMetadata(baseInput())]).toEqual(['meta-description']);
  });

  it('claims the link and indexability audits once their facts were extracted', () => {
    const covered = lighthouseAuditsCoveredByHeadMetadata(
      baseInput({ xRobotsTag: null, anchors: [] }),
    );
    expect([...covered].sort()).toEqual([
      'crawlable-anchors',
      'is-crawlable',
      'link-text',
      'meta-description',
    ]);
  });
});

/**
 * 2026-08-24 dead-rule sweep. `canonical-missing` carried a severity
 * mapping and remediation copy from milestone 8 with no emitter anywhere,
 * the same shape as trade-off 28's unread LCEN regime and trade-off 31's
 * `hreflang-missing`. The two neighbouring canonical checks both need a
 * canonical to already exist, so zero was the uncovered case.
 */
describe('canonical-missing', () => {
  function headInput(canonicalUrls: string[]) {
    return {
      pageUrl: 'https://example.com/',
      title: 'Example',
      metaDescription: null,
      canonicalUrls,
      openGraphTags: {},
      jsonLdBlocks: [],
      headings: [],
      hreflangLinks: [],
      robotsMeta: null,
    };
  }

  it('fires when a page declares no canonical URL', () => {
    const ids = extractHeadMetadataCandidates(headInput([])).map((c) => c.ruleId);
    expect(ids).toContain(CANONICAL_MISSING_RULE_ID);
  });

  it('stays silent when a canonical is declared', () => {
    const ids = extractHeadMetadataCandidates(headInput(['https://example.com/'])).map(
      (c) => c.ruleId,
    );
    expect(ids).not.toContain(CANONICAL_MISSING_RULE_ID);
  });

  it('does not also fire when several conflicting canonicals are declared', () => {
    const ids = extractHeadMetadataCandidates(
      headInput(['https://example.com/a', 'https://example.com/b']),
    ).map((c) => c.ruleId);
    expect(ids).not.toContain(CANONICAL_MISSING_RULE_ID);
    expect(ids).toContain(CANONICAL_CONFLICTING_RULE_ID);
  });
});
