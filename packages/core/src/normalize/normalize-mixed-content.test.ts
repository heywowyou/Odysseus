import { describe, expect, it } from 'vitest';
import { extractMixedContentCandidates, MIXED_CONTENT_RULE_ID } from './normalize-mixed-content.js';

describe('mixed-content', () => {
  it('fires when a secure page loads insecure resources', () => {
    const candidates = extractMixedContentCandidates({
      pageUrl: 'https://example.com/',
      isPageSecure: true,
      insecureResourceUrls: ['http://example.com/legacy.js'],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(MIXED_CONTENT_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('serious');
    expect(candidates[0]?.element).toBeNull();
  });

  it('does not fire for a secure page with no insecure resources', () => {
    expect(
      extractMixedContentCandidates({ pageUrl: 'https://example.com/', isPageSecure: true, insecureResourceUrls: [] }),
    ).toEqual([]);
  });

  it('does not fire for a page that is not itself served over https', () => {
    expect(
      extractMixedContentCandidates({
        pageUrl: 'http://example.com/',
        isPageSecure: false,
        insecureResourceUrls: ['http://example.com/script.js'],
      }),
    ).toEqual([]);
  });
});
