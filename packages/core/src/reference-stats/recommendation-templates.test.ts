import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECK_SEVERITY } from '../normalize/severity.js';
import { getRecommendationTemplates, RECOMMENDATION_TEMPLATES, recommendationTemplateSchema } from './recommendation-templates.js';

// Mirrors the seo/geo ruleId set in severity.ts's CUSTOM_CHECK_SEVERITY at
// the time this table was written. Duplicated by value rather than
// imported, since severity.ts has no per-rule category export - this is
// a regression trip-wire (a new seo/geo custom check added later without
// a template shows up as a failing assertion here), not the source of
// truth for which rules exist.
const SEO_GEO_RULE_IDS = [
  'robots-blocks-indexing',
  'noindex-on-public-page',
  'broken-internal-link',
  'redirect-chain-excessive',
  'mixed-content',
  'http-error-status',
  'meta-title-missing',
  'meta-title-length',
  'meta-description-missing',
  'meta-description-length',
  'canonical-missing',
  'canonical-conflicting',
  'sitemap-missing',
  'sitemap-stale',
  'jsonld-missing',
  'jsonld-invalid',
  'hreflang-missing',
  'hreflang-invalid',
  'hreflang-no-return-link',
  'heading-hierarchy-skip',
  'multiple-h1',
  'no-h1',
  'opengraph-missing',
  'image-oversized',
  'image-legacy-format',
  'lcen-mentions-legales-missing',
  'canonical-target-unreachable',
  'canonical-target-noindex',
  'sitemap-orphan-page',
  'robots-disallow-broad',
  'llms-txt-missing',
  'structured-data-entity-missing',
  'entity-data-incomplete',
  'faq-content-without-schema',
];

describe('RECOMMENDATION_TEMPLATES', () => {
  it('has at least one template for every known seo/geo ruleId', () => {
    for (const ruleId of SEO_GEO_RULE_IDS) {
      expect(getRecommendationTemplates(ruleId).length).toBeGreaterThan(0);
    }
  });

  it('every listed ruleId is a real entry in severity.ts, so nothing here targets a dead rule', () => {
    for (const ruleId of Object.keys(RECOMMENDATION_TEMPLATES)) {
      expect(CUSTOM_CHECK_SEVERITY[ruleId]).toBeDefined();
    }
  });

  it('validates every template against the schema (non-empty bilingual text)', () => {
    for (const templates of Object.values(RECOMMENDATION_TEMPLATES)) {
      for (const template of templates) {
        expect(() => recommendationTemplateSchema.parse(template)).not.toThrow();
      }
    }
  });

  it('has unique template ids within each ruleId group', () => {
    for (const templates of Object.values(RECOMMENDATION_TEMPLATES)) {
      const ids = templates.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('returns an empty array for an accessibility ruleId, out of scope for this table', () => {
    expect(getRecommendationTemplates('keyboard-trap')).toEqual([]);
    expect(getRecommendationTemplates('video-missing-captions')).toEqual([]);
  });

  it('returns an empty array for an unknown ruleId', () => {
    expect(getRecommendationTemplates('not-a-real-rule')).toEqual([]);
  });
});
