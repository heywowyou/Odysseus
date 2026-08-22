import { describe, expect, it } from 'vitest';
import { extractStructuredDataCandidates, STRUCTURED_DATA_INVALID_RULE_ID } from './normalize-structured-data.js';

describe('structured-data', () => {
  it('fires one finding for a page with failed schema fields', () => {
    const candidates = extractStructuredDataCandidates({
      pageUrl: 'https://example.com/article',
      schemasFound: ['Article'],
      failedTests: [
        { test: 'Article[0].headline', schema: 'Article', type: 'jsonld' },
        { test: 'Article[0].datePublished', schema: 'Article', type: 'jsonld' },
      ],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(STRUCTURED_DATA_INVALID_RULE_ID);
    expect(candidates[0]?.category).toBe('geo');
    expect(candidates[0]?.title).toContain('Structured data');
    expect(candidates[0]?.rawEvidenceForPage).toMatchObject({ schemasFound: ['Article'] });
  });

  it('does not fire when there are no failed tests', () => {
    expect(
      extractStructuredDataCandidates({ pageUrl: 'https://example.com/', schemasFound: [], failedTests: [] }),
    ).toEqual([]);
  });
});
