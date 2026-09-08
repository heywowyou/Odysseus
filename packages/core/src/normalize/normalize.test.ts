import { describe, expect, it } from 'vitest';
import { normalizeAudit, type NormalizeAuditInput } from './normalize.js';
import {
  buildAxeNode,
  buildAxeResultsInput,
  buildAxeViolation,
  buildNormalizePageInput,
  buildRenderDiffResult,
} from './fixtures.js';

const STARTED_AT = new Date('2026-08-02T00:00:00.000Z');

describe('normalizeAudit', () => {
  it('merges the same exact selector across two pages into one finding', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({ id: 'color-contrast', nodes: [buildAxeNode({ target: ['#footer a'] })] }),
    ]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        buildNormalizePageInput({ url: 'https://example.com/', axe }),
        buildNormalizePageInput({ url: 'https://example.com/about', axe }),
      ],
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.pageUrls).toEqual(['https://example.com/', 'https://example.com/about']);
    expect(finding?.occurrences).toBe(2);
    const perPage = (finding?.rawEvidence['perPage'] ?? {}) as Record<string, unknown>;
    expect(Object.keys(perPage).sort()).toEqual(
      ['https://example.com/', 'https://example.com/about'].sort(),
    );
  });

  it('does NOT merge the same rule with different selectors across pages', () => {
    const axeA = buildAxeResultsInput([
      buildAxeViolation({ id: 'image-alt', nodes: [buildAxeNode({ target: ['#hero-img'] })] }),
    ]);
    const axeB = buildAxeResultsInput([
      buildAxeViolation({ id: 'image-alt', nodes: [buildAxeNode({ target: ['#banner-img'] })] }),
    ]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        buildNormalizePageInput({ url: 'https://example.com/', axe: axeA }),
        buildNormalizePageInput({ url: 'https://example.com/other', axe: axeB }),
      ],
    });

    expect(findings).toHaveLength(2);
    expect(new Set(findings.map((f) => f.dedupeKey)).size).toBe(2);
  });

  it('merges element-scoped candidates from multiple nodes on one page into one finding', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        id: 'color-contrast',
        nodes: [buildAxeNode({ target: ['#a'] }), buildAxeNode({ target: ['#a'] })],
      }),
    ]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: 'https://example.com/', axe })],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.occurrences).toBe(2);
  });

  it('merges the same rule with different selectors on one page into one finding', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        id: 'link-in-text-block',
        nodes: [buildAxeNode({ target: ['#a'] }), buildAxeNode({ target: ['#b'] })],
      }),
    ]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: 'https://example.com/mentions-legales', axe })],
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.occurrences).toBe(2);
    expect(finding?.elements.map((e) => e.selector).sort()).toEqual(['#a', '#b']);
    expect(finding?.pageUrls).toEqual(['https://example.com/mentions-legales']);

    // Neither selector's own dedupe key, since two fine groups collided
    // on this page and were merged under a page-based key instead.
    const soloA = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        buildNormalizePageInput({
          url: 'https://example.com/mentions-legales',
          axe: buildAxeResultsInput([
            buildAxeViolation({
              id: 'link-in-text-block',
              nodes: [buildAxeNode({ target: ['#a'] })],
            }),
          ]),
        }),
      ],
    });
    expect(finding?.dedupeKey).not.toBe(soloA[0]?.dedupeKey);
  });

  it('caps elements at MAX_ELEMENTS_PER_FINDING when many selectors collide on one page', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => buildAxeNode({ target: [`#node-${i}`] }));
    const axe = buildAxeResultsInput([buildAxeViolation({ id: 'link-in-text-block', nodes })]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: 'https://example.com/mentions-legales', axe })],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.occurrences).toBe(25);
    expect(findings[0]?.elements).toHaveLength(20);
  });

  it('assigns sequential findingIds and stamps schemaVersion/auditId/dedupeKey/timestamps', () => {
    const renderDiff = buildRenderDiffResult({ missingPercent: 90 });
    const findings = normalizeAudit({
      auditId: 'audit-xyz',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: renderDiff.pageUrl, renderDiff })],
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.findingId).toBe('f001');
    expect(finding?.auditId).toBe('audit-xyz');
    expect(finding?.schemaVersion).toBe(1);
    expect(finding?.firstSeenAt).toEqual(STARTED_AT);
    expect(finding?.lastSeenAt).toEqual(STARTED_AT);
    expect(finding?.dedupeKey).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces an empty findings array when no page has any scanner output', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: 'https://example.com/' })],
    });
    expect(findings).toEqual([]);
  });

  it('page-scoped render-diff findings never carry sentinel selectors', () => {
    const renderDiff = buildRenderDiffResult({ missingPercent: 90 });
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: renderDiff.pageUrl, renderDiff })],
    });
    expect(findings[0]?.elements).toEqual([]);
  });

  describe('milestone 8.5a SEO/GEO checks', () => {
    it('wires canonicalTarget into the orchestrator', () => {
      const findings = normalizeAudit({
        auditId: 'audit-1',
        startedAt: STARTED_AT,
        pages: [
          buildNormalizePageInput({
            url: 'https://example.com/',
            canonicalTarget: {
              pageUrl: 'https://example.com/',
              canonicalUrl: 'https://example.com/gone',
              httpStatus: 404,
              noindex: false,
            },
          }),
        ],
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('canonical-target-unreachable');
      expect(findings[0]?.category).toBe('seo');
    });

    it('wires llmsTxtCheck into the orchestrator', () => {
      const findings = normalizeAudit({
        auditId: 'audit-1',
        startedAt: STARTED_AT,
        pages: [
          buildNormalizePageInput({ url: 'https://example.com/', llmsTxtCheck: { found: false } }),
        ],
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('llms-txt-missing');
      expect(findings[0]?.category).toBe('geo');
    });

    it('wires the site-wide GEO entity check across every page, attributed to a content-checked page', () => {
      const findings = normalizeAudit({
        auditId: 'audit-1',
        startedAt: STARTED_AT,
        pages: [
          buildNormalizePageInput({
            url: 'https://example.com/about',
            headMetadata: {
              pageUrl: 'https://example.com/about',
              title: null,
              metaDescription: null,
              canonicalUrls: [],
              openGraphTags: {},
              jsonLdBlocks: [],
              headings: [],
              hreflangLinks: [],
              robotsMeta: null,
            },
          }),
        ],
        crawl: { startUrl: 'https://example.com/', pages: [] },
      });
      const entityMissing = findings.filter((f) => f.ruleId === 'structured-data-entity-missing');
      expect(entityMissing).toHaveLength(1);
      // Issue #101: the start URL carries no scan here, so the site-level
      // fact must anchor to the page that was actually content-checked.
      expect(entityMissing[0]?.pageUrls).toEqual(['https://example.com/about']);
    });

    it('wires robots-disallow-broad from the crawl input', () => {
      const findings = normalizeAudit({
        auditId: 'audit-1',
        startedAt: STARTED_AT,
        pages: [buildNormalizePageInput({ url: 'https://example.com/' })],
        crawl: {
          startUrl: 'https://example.com/',
          pages: [{ url: 'https://example.com/', status: 'visited', httpStatus: 200 }],
          robotsDisallowMatches: [{ pattern: '/blog/', matchedPageCount: 4 }],
        },
      });
      expect(findings.map((f) => f.ruleId)).toContain('robots-disallow-broad');
    });
  });
});

/**
 * B2 (2026-08-24 three-site review). A real Haaitza audit reported the
 * same missing gallery link text five times, once per language variant of
 * one page; 182 of its 265 link-name findings had exactly that shape.
 */
describe('B2: language-variant collapsing', () => {
  const gallery = [
    'https://haaitza.com/galerie-hotel-de-luxe-pyla',
    'https://haaitza.com/en/photo-gallery-hotels-spa-gironde',
    'https://haaitza.com/es/galera',
  ];

  const clusters = [
    {
      canonicalPageUrl: gallery[0]!,
      members: [
        { pageUrl: gallery[0]!, lang: 'fr' },
        { pageUrl: gallery[1]!, lang: 'en' },
        { pageUrl: gallery[2]!, lang: 'es' },
      ],
    },
  ];

  /** One defect in a shared template: the same rule, a per-instance
   *  selector, once per language. Exactly the real shape. */
  const pages = gallery.map((url, index) => ({
    url,
    axe: {
      testEngine: { name: 'axe-core', version: '4.12.1' },
      violations: [
        {
          id: 'link-name',
          impact: 'serious',
          tags: ['wcag2a', 'wcag244', 'wcag412'],
          help: 'Links must have discernible text',
          description: 'Links must have discernible text',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.12/link-name',
          nodes: [
            { target: [`a[data-slide="21${index}0_23"]`], html: '<a></a>', failureSummary: '' },
          ],
        },
      ],
    },
  })) as unknown as NormalizeAuditInput['pages'];

  const args = { auditId: 'a1', startedAt: new Date('2026-08-24T00:00:00Z'), pages };

  it('reports one finding per language without clusters', () => {
    expect(normalizeAudit(args).filter((f) => f.ruleId === 'link-name')).toHaveLength(3);
  });

  it('collapses them into one finding when the site declares them as translations', () => {
    const findings = normalizeAudit({ ...args, translationClusters: clusters }).filter(
      (f) => f.ruleId === 'link-name',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.occurrences).toBe(3);
  });

  it('still records every real page URL on the collapsed finding', () => {
    const [finding] = normalizeAudit({ ...args, translationClusters: clusters }).filter(
      (f) => f.ruleId === 'link-name',
    );
    expect([...finding!.pageUrls].sort()).toEqual([...gallery].sort());
  });

  it('is a no-op on a monolingual site, where every page is its own cluster', () => {
    const singletons = gallery.map((url) => ({
      canonicalPageUrl: url,
      members: [{ pageUrl: url }],
    }));
    expect(normalizeAudit({ ...args, translationClusters: singletons })).toEqual(
      normalizeAudit(args),
    );
  });
});

/**
 * Regression cover for a defect the per-function tests could not see
 * (2026-08-24, lagnonu.fr). `detectMissingHreflang` fires only when no
 * page declares hreflang, but `normalizeAudit` used to hand
 * `extractHreflangCandidates` only those pages that already had hreflang,
 * and skipped the call entirely when there were none - so the emitter was
 * unreachable through the pipeline while its own unit tests, which call it
 * directly, passed. A real trilingual 65-page site with zero hreflang
 * produced no finding. These assertions go through `normalizeAudit` for
 * that reason; do not rewrite them against `extractHreflangCandidates`.
 */
describe('normalizeAudit hreflang wiring', () => {
  function pageWithHreflang(url: string, hreflangLinks: Array<{ lang: string; href: string }>) {
    return buildNormalizePageInput({
      url,
      headMetadata: {
        pageUrl: url,
        title: null,
        metaDescription: null,
        canonicalUrls: [],
        openGraphTags: {},
        jsonLdBlocks: [],
        headings: [],
        hreflangLinks,
        robotsMeta: null,
      },
    });
  }

  it('emits hreflang-missing when a multilingual site declares no hreflang anywhere', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        pageWithHreflang('https://example.com/fr/accueil', []),
        pageWithHreflang('https://example.com/en/home', []),
        pageWithHreflang('https://example.com/es/bienvenida', []),
      ],
    });
    const missing = findings.filter((f) => f.ruleId === 'hreflang-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.description).toContain('en, es, fr');
  });

  it('anchors to a content-checked page when the crawl start URL was never scanned (issue #101)', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        pageWithHreflang('https://example.com/en/activities', []),
        pageWithHreflang('https://example.com/fr/accueil', []),
      ],
      crawl: { startUrl: 'https://example.com/', pages: [] },
    });
    const missing = findings.filter((f) => f.ruleId === 'hreflang-missing');
    expect(missing).toHaveLength(1);
    // The start URL carries no scan here, so anchoring the site-level fact
    // to it would attribute it to a page no scanner ran on (and pushed the
    // report's affected-page count past its own analyzed scope). Ties on
    // depth break by URL ascending, hence /en/activities.
    expect(missing[0]?.pageUrls).toEqual(['https://example.com/en/activities']);
  });

  it('keeps anchoring to the crawl start URL when the start URL itself was content-checked', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        pageWithHreflang('https://example.com/', []),
        pageWithHreflang('https://example.com/fr/accueil', []),
        pageWithHreflang('https://example.com/en/activities', []),
      ],
      crawl: {
        startUrl: 'https://example.com/',
        pages: [
          { url: 'https://example.com/', status: 'visited', depth: 0 },
          { url: 'https://example.com/fr/accueil', status: 'visited', depth: 1 },
          { url: 'https://example.com/en/activities', status: 'visited', depth: 1 },
        ],
      },
    });
    const missing = findings.filter((f) => f.ruleId === 'hreflang-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.pageUrls).toEqual(['https://example.com/']);
  });

  it('stays silent on a monolingual site with no hreflang', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        pageWithHreflang('https://example.com/', []),
        pageWithHreflang('https://example.com/tarifs', []),
      ],
    });
    expect(findings.filter((f) => f.ruleId === 'hreflang-missing')).toHaveLength(0);
  });

  it('stays silent when the site does declare hreflang', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        pageWithHreflang('https://example.com/fr/accueil', [
          { lang: 'fr', href: 'https://example.com/fr/accueil' },
          { lang: 'en', href: 'https://example.com/en/home' },
        ]),
        pageWithHreflang('https://example.com/en/home', [
          { lang: 'fr', href: 'https://example.com/fr/accueil' },
          { lang: 'en', href: 'https://example.com/en/home' },
        ]),
      ],
    });
    expect(findings.filter((f) => f.ruleId === 'hreflang-missing')).toHaveLength(0);
  });

  it('reports a crawled target that does not link back, rather than treating it as out of scope', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        pageWithHreflang('https://example.com/fr/accueil', [
          { lang: 'en', href: 'https://example.com/en/home' },
        ]),
        pageWithHreflang('https://example.com/en/home', []),
      ],
    });
    expect(findings.filter((f) => f.ruleId === 'hreflang-no-return-link')).toHaveLength(1);
  });
});

/**
 * Issue #101 regression cover, shaped after the real Villas Foch audit:
 * the crawl start URL (and every language root) was recorded
 * discovered-not-scanned, yet the three site-level findings carried it as
 * their affected page. The executive summary then claimed findings on 29
 * pages of a 28-page analyzed scope, and the appendix attributed CrUX
 * field data, a hreflang absence, and a structured-data absence to a page
 * on which no check ever ran. Every site-level emitter must anchor to a
 * page that was actually content-checked.
 */
describe('site-level findings anchor to a content-checked page (issue #101)', () => {
  const START_URL = 'https://villasfoch.test/';

  function pageWithoutHeadMarkup(url: string) {
    return buildNormalizePageInput({
      url,
      headMetadata: {
        pageUrl: url,
        title: null,
        metaDescription: null,
        canonicalUrls: [],
        openGraphTags: {},
        jsonLdBlocks: [],
        headings: [],
        hreflangLinks: [],
        robotsMeta: null,
      },
    });
  }

  const input = {
    auditId: 'audit-1',
    startedAt: STARTED_AT,
    // The shallowest content-checked page wins the anchor; the language
    // roots were crawled for links only, so no scanner ran on them.
    pages: [
      pageWithoutHeadMarkup('https://villasfoch.test/fr/chambres'),
      pageWithoutHeadMarkup('https://villasfoch.test/en/rooms'),
    ],
    crawl: {
      startUrl: START_URL,
      pages: [
        { url: START_URL, status: 'discovered-not-scanned' as const, depth: 0 },
        { url: 'https://villasfoch.test/fr', status: 'discovered-not-scanned' as const, depth: 0 },
        { url: 'https://villasfoch.test/en', status: 'discovered-not-scanned' as const, depth: 0 },
        {
          url: 'https://villasfoch.test/fr/chambres',
          status: 'visited' as const,
          depth: 1,
          httpStatus: 200,
        },
        {
          url: 'https://villasfoch.test/en/rooms',
          status: 'visited' as const,
          depth: 2,
          httpStatus: 200,
        },
      ],
    },
    cruxFieldData: { available: true, cls: { p75: 0.3 } },
  };

  it('anchors crux-cls-poor to the shallowest content-checked page, not the start URL', () => {
    const findings = normalizeAudit(input);
    const crux = findings.filter((f) => f.ruleId === 'crux-cls-poor');
    expect(crux).toHaveLength(1);
    expect(crux[0]?.pageUrls).toEqual(['https://villasfoch.test/fr/chambres']);
  });

  it('anchors hreflang-missing to a content-checked page, not the start URL', () => {
    const findings = normalizeAudit(input);
    const missing = findings.filter((f) => f.ruleId === 'hreflang-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.pageUrls).toEqual(['https://villasfoch.test/fr/chambres']);
  });

  it('anchors structured-data-entity-missing to a content-checked page, not the start URL', () => {
    const findings = normalizeAudit(input);
    const entity = findings.filter((f) => f.ruleId === 'structured-data-entity-missing');
    expect(entity).toHaveLength(1);
    expect(entity[0]?.pageUrls).toEqual(['https://villasfoch.test/fr/chambres']);
  });

  it('emits no site-level finding at all when nothing was content-checked', () => {
    const findings = normalizeAudit({ ...input, pages: [] });
    const ruleIds = findings.map((f) => f.ruleId);
    expect(ruleIds).not.toContain('crux-cls-poor');
    expect(ruleIds).not.toContain('hreflang-missing');
    expect(ruleIds).not.toContain('structured-data-entity-missing');
  });
});
