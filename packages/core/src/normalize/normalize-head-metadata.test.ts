import { describe, expect, it } from 'vitest';
import {
  extractHeadMetadataCandidates,
  META_TITLE_LENGTH_RULE_ID,
  META_DESCRIPTION_LENGTH_RULE_ID,
  CANONICAL_CONFLICTING_RULE_ID,
  JSONLD_MISSING_RULE_ID,
  JSONLD_INVALID_RULE_ID,
  HEADING_HIERARCHY_SKIP_RULE_ID,
  MULTIPLE_H1_RULE_ID,
  NO_H1_RULE_ID,
  OPENGRAPH_MISSING_RULE_ID,
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
    openGraphTags: { 'og:title': 'Title', 'og:description': 'Description', 'og:image': 'https://example.com/img.png' },
    jsonLdBlocks: [{ raw: '{"@context":"https://schema.org","@type":"WebPage"}', selector: '#ld1', parsed: {} }],
    headings: [
      { level: 1, text: 'Main heading', selector: 'h1:nth-of-type(1)' },
      { level: 2, text: 'Sub heading', selector: 'h2:nth-of-type(1)' },
    ],
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

  it('emits nothing for missing title/description/canonical (Lighthouse already covers those)', () => {
    const candidates = extractHeadMetadataCandidates(
      baseInput({ title: null, metaDescription: null, canonicalUrls: [] }),
    );
    expect(candidates).toEqual([]);
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
    const candidates = extractHeadMetadataCandidates(
      baseInput({ title: 'A'.repeat(100) }),
    );
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
    const candidates = extractHeadMetadataCandidates(baseInput({ metaDescription: 'A'.repeat(200) }));
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
    expect(extractHeadMetadataCandidates(baseInput({ canonicalUrls: ['https://example.com/'] }))).toEqual([]);
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
        jsonLdBlocks: [{ raw: '{not valid json', selector: '#ld1', parsed: null, parseError: 'Unexpected token' }],
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
      baseInput({ headings: [{ level: 2, text: 'Only a sub-heading', selector: 'h2:nth-of-type(1)' }] }),
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
    expect(extractHeadMetadataCandidates(baseInput({ openGraphTags: { 'og:title': 'Title' } }))).toEqual([]);
  });

  it('does not fire when unrelated og: tags are present alongside a core one', () => {
    expect(
      extractHeadMetadataCandidates(
        baseInput({ openGraphTags: { 'og:title': 'Title', 'og:locale': 'en_US' } }),
      ),
    ).toEqual([]);
  });
});
