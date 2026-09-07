import { describe, expect, it } from 'vitest';
import {
  buildContentAuditPlan,
  finalizeLighthousePlan,
  isConfirmedListing,
  type PageAuditDecision,
  type RenderedCostProfile,
} from './full-audit-plan.js';
import {
  hashTemplateFamily,
  type PageAuditProfile,
  type PageRoleSignal,
} from './page-audit-profile.js';

function profile(
  url: string,
  signals: PageRoleSignal[],
  opts: { templateFamilyId?: string; language?: string } = {},
): PageAuditProfile {
  return {
    url,
    profileVersion: 'v1',
    roleSignals: signals,
    ...(opts.language !== undefined ? { language: opts.language } : {}),
    ...(opts.templateFamilyId !== undefined ? { templateFamilyId: opts.templateFamilyId } : {}),
  };
}

const contentSignal: PageRoleSignal = { kind: 'content-json-ld-type', detail: 'Article' };
const listingSignals: PageRoleSignal[] = [
  { kind: 'listing-json-ld-type', detail: 'CollectionPage' },
  { kind: 'numbered-pagination-control', detail: '5' },
];
const transactionalSignal: PageRoleSignal = { kind: 'transactional-form', detail: '1 form(s)' };

const ARTICLE_FAMILY_FR = hashTemplateFamily(['HEADER.site', 'MAIN.article', 'FOOTER.site'])!;
const ARTICLE_FAMILY_EN = hashTemplateFamily(['HEADER.site', 'MAIN.article-en', 'FOOTER.site'])!;
const LISTING_FAMILY = hashTemplateFamily(['HEADER.site', 'MAIN.listing', 'FOOTER.site'])!;

function buildArticleFamily(count: number, language: string, familyId: string): PageAuditProfile[] {
  return Array.from({ length: count }, (_, i) =>
    profile(`https://example.com/${language}/post-${String(i).padStart(3, '0')}`, [contentSignal], {
      templateFamilyId: familyId,
      language,
    }),
  );
}

/** The motivating issue #20 shape: 375 articles sharing one template
 *  across two languages, a repeated listing family, a booking
 *  (transactional) page, an operator seed, a homepage, one unique content
 *  page, and pages with missing/contradictory signals. */
function buildMotivatingFixture(): PageAuditProfile[] {
  const frArticles = buildArticleFamily(300, 'fr', ARTICLE_FAMILY_FR);
  const enArticles = buildArticleFamily(75, 'en', ARTICLE_FAMILY_EN);

  const listingFamily = Array.from({ length: 12 }, (_, i) =>
    profile(`https://example.com/category/${i}`, listingSignals, {
      templateFamilyId: LISTING_FAMILY,
    }),
  );

  const homepage = profile('https://example.com/', [
    { kind: 'homepage-url', detail: 'https://example.com/' },
    contentSignal,
  ]);
  const booking = profile('https://example.com/reserver', [transactionalSignal], {
    templateFamilyId: LISTING_FAMILY, // even inside a listing family, transactional always wins
  });
  const operatorSeed = profile(
    'https://example.com/legal-notice',
    [contentSignal, { kind: 'operator-seed', detail: 'https://example.com/legal-notice' }],
    { templateFamilyId: ARTICLE_FAMILY_FR }, // a seed inside the article family is still mandatory
  );
  const uniqueContentPage = profile('https://example.com/about', [contentSignal]); // no templateFamilyId
  const noSignalsPage = profile('https://example.com/mystery', []);
  const conflictingPage = profile('https://example.com/conflicting', [
    contentSignal,
    ...listingSignals,
  ]);

  return [
    ...frArticles,
    ...enArticles,
    ...listingFamily,
    homepage,
    booking,
    operatorSeed,
    uniqueContentPage,
    noSignalsPage,
    conflictingPage,
  ];
}

describe('buildContentAuditPlan', () => {
  it('schedules render diff, axe, and extended on every page, including every listing', () => {
    const plan = buildContentAuditPlan(buildMotivatingFixture());
    for (const decision of plan.decisions) {
      expect(decision.plannedPasses).toEqual(['rendered', 'axe', 'extended']);
    }
  });

  it('produces exactly one decision per input profile, never fabricating or dropping one', () => {
    const profiles = buildMotivatingFixture();
    const plan = buildContentAuditPlan(profiles);
    expect(plan.decisions).toHaveLength(profiles.length);
    expect(new Set(plan.decisions.map((d) => d.url))).toEqual(new Set(profiles.map((p) => p.url)));
  });

  it('classifies a repeated article family as content, high confidence', () => {
    const plan = buildContentAuditPlan(buildArticleFamily(3, 'fr', ARTICLE_FAMILY_FR));
    for (const decision of plan.decisions) {
      expect(decision.role).toBe('content');
      expect(decision.confidence).toBe('high');
    }
  });

  it('classifies a repeated listing family as listing, high confidence, from two signals', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/tag/a', listingSignals, { templateFamilyId: LISTING_FAMILY }),
    ]);
    expect(plan.decisions[0]!.role).toBe('listing');
    expect(plan.decisions[0]!.confidence).toBe('high');
  });

  it('does not classify as listing from a single weak signal', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/maybe-listing', [listingSignals[0]!]),
    ]);
    expect(plan.decisions[0]!.role).toBe('unknown');
    expect(plan.decisions[0]!.confidence).toBe('fallback');
  });

  it('never classifies from URL text alone (no signals derived from the URL itself)', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/category/archive/tag/2024/page/3', []),
    ]);
    expect(plan.decisions[0]!.role).toBe('unknown');
  });

  it('promotes a transactional form to transactional regardless of other signals', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/book', [transactionalSignal, ...listingSignals]),
    ]);
    expect(plan.decisions[0]!.role).toBe('transactional');
    expect(plan.decisions[0]!.confidence).toBe('high');
  });

  // Issue #86: a hotel handing booking off to a third-party engine has no
  // same-document form, so this signal must promote the same way.
  it('promotes an external transactional link to transactional regardless of other signals', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/book', [
        { kind: 'external-transactional-link', detail: '1 link(s)' },
        ...listingSignals,
      ]),
    ]);
    expect(plan.decisions[0]!.role).toBe('transactional');
    expect(plan.decisions[0]!.confidence).toBe('high');
  });

  // Issue #89: the reason code is the audit trail naming the mechanism
  // that fired, so a link-out-only page must not record "form detected".
  it('records the form reason code only for a form signal', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/book', [transactionalSignal]),
    ]);
    expect(plan.decisions[0]!.reasonCodes).toContain('transactional-form-detected');
    expect(plan.decisions[0]!.reasonCodes).not.toContain('transactional-link-out-detected');
  });

  it('records the link-out reason code, not the form one, for a link-out-only page', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/book', [
        { kind: 'external-transactional-link', detail: '1 link(s)' },
      ]),
    ]);
    expect(plan.decisions[0]!.reasonCodes).toContain('transactional-link-out-detected');
    expect(plan.decisions[0]!.reasonCodes).not.toContain('transactional-form-detected');
  });

  it('records both reason codes when both transactional signal kinds fired', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/book', [
        transactionalSignal,
        { kind: 'external-transactional-link', detail: '1 link(s)' },
      ]),
    ]);
    expect(plan.decisions[0]!.reasonCodes).toContain('transactional-form-detected');
    expect(plan.decisions[0]!.reasonCodes).toContain('transactional-link-out-detected');
  });

  it('falls back to unknown on conflicting listing and content signals', () => {
    const plan = buildContentAuditPlan([
      profile('https://example.com/conflicting', [contentSignal, ...listingSignals]),
    ]);
    expect(plan.decisions[0]!.role).toBe('unknown');
    expect(plan.decisions[0]!.confidence).toBe('fallback');
  });

  it('falls back to unknown with no signals at all', () => {
    const plan = buildContentAuditPlan([profile('https://example.com/blank', [])]);
    expect(plan.decisions[0]!.role).toBe('unknown');
    expect(plan.decisions[0]!.confidence).toBe('fallback');
  });

  it('is invariant to input order', () => {
    const profiles = buildMotivatingFixture();
    const forward = buildContentAuditPlan(profiles);
    const shuffled = buildContentAuditPlan([...profiles].reverse());
    expect(shuffled.decisions).toEqual(forward.decisions);
  });
});

function makeCost(url: string, overrides: Partial<RenderedCostProfile> = {}): RenderedCostProfile {
  return {
    url,
    domNodeCount: 500,
    imageCount: 5,
    resourceCount: 20,
    knownTransferBytes: 100_000,
    unknownTransferSizeCount: 0,
    ...overrides,
  };
}

function findByUrl(decisions: readonly PageAuditDecision[], url: string): PageAuditDecision {
  const found = decisions.find((d) => d.url === url);
  if (found === undefined) throw new Error(`no decision for ${url}`);
  return found;
}

function ranLighthouse(decision: PageAuditDecision): boolean {
  return decision.plannedPasses.includes('lighthouse');
}

describe('finalizeLighthousePlan', () => {
  it('bounds Lighthouse work by family/language/outlier rather than article count (issue #20)', () => {
    const profiles = buildMotivatingFixture();
    const contentPlan = buildContentAuditPlan(profiles);
    const costs = new Map(profiles.map((p) => [p.url, makeCost(p.url)]));
    // The outlier lives inside the French article family.
    costs.set(
      'https://example.com/fr/post-150',
      makeCost('https://example.com/fr/post-150', { resourceCount: 999, imageCount: 80 }),
    );
    const finalPlan = finalizeLighthousePlan(contentPlan, costs);

    const lighthouseUrls = finalPlan.decisions.filter(ranLighthouse).map((d) => d.url);
    // homepage + booking + seed + unique + no-signals + conflicting = 6
    // mandatory, plus at most 2 per article family/language (fr, en) = 4,
    // plus 0 for the exempt repeated listing family. Well under 375.
    expect(lighthouseUrls.length).toBeLessThan(15);
    expect(lighthouseUrls.length).toBeGreaterThanOrEqual(10);
  });

  it('never selects a member of a repeated high-confidence listing family for Lighthouse', () => {
    const profiles = Array.from({ length: 20 }, (_, i) =>
      profile(`https://example.com/tag/${i}`, listingSignals, { templateFamilyId: LISTING_FAMILY }),
    );
    const contentPlan = buildContentAuditPlan(profiles);
    const costs = new Map(profiles.map((p) => [p.url, makeCost(p.url)]));
    const finalPlan = finalizeLighthousePlan(contentPlan, costs);
    expect(finalPlan.decisions.some(ranLighthouse)).toBe(false);
  });

  it('runs Lighthouse once for a family with exactly one member', () => {
    const profiles = [
      profile('https://example.com/solo', [contentSignal], { templateFamilyId: 'solo-family' }),
    ];
    const contentPlan = buildContentAuditPlan(profiles);
    const finalPlan = finalizeLighthousePlan(contentPlan, new Map());
    expect(ranLighthouse(finalPlan.decisions[0]!)).toBe(true);
    expect(finalPlan.decisions[0]!.reasonCodes).toContain('unique-template-family');
  });

  it('selects the stable-first and cost-outlier representatives for a repeated content family', () => {
    const urls = ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'];
    const profiles = urls.map((u) => profile(u, [contentSignal], { templateFamilyId: 'fam-x' }));
    const contentPlan = buildContentAuditPlan(profiles);
    const costs = new Map([
      [urls[0]!, makeCost(urls[0]!, { resourceCount: 5 })],
      [urls[1]!, makeCost(urls[1]!, { resourceCount: 5 })],
      [urls[2]!, makeCost(urls[2]!, { resourceCount: 500 })], // clear outlier
    ]);
    const finalPlan = finalizeLighthousePlan(contentPlan, costs);
    const selected = finalPlan.decisions.filter(ranLighthouse).map((d) => d.url);
    expect(selected.sort()).toEqual([urls[0], urls[2]].sort()); // stable-first (a) + outlier (c)
  });

  it('always selects the homepage, transactional, seeded, unique, and unknown/fallback pages', () => {
    const profiles = buildMotivatingFixture();
    const contentPlan = buildContentAuditPlan(profiles);
    const costs = new Map(profiles.map((p) => [p.url, makeCost(p.url)]));
    const finalPlan = finalizeLighthousePlan(contentPlan, costs);

    for (const url of [
      'https://example.com/',
      'https://example.com/reserver',
      'https://example.com/legal-notice',
      'https://example.com/about',
      'https://example.com/mystery',
      'https://example.com/conflicting',
    ]) {
      expect(ranLighthouse(findByUrl(finalPlan.decisions, url))).toBe(true);
    }
  });

  it('deduplicates a page selected by more than one reason and preserves every reason code', () => {
    // The operator seed above also sits inside the article family, so it
    // could in principle be selected both as a mandatory seed and as a
    // family representative; it must appear in plannedPasses exactly once.
    const profiles = buildMotivatingFixture();
    const contentPlan = buildContentAuditPlan(profiles);
    const costs = new Map(profiles.map((p) => [p.url, makeCost(p.url)]));
    const finalPlan = finalizeLighthousePlan(contentPlan, costs);
    const seed = findByUrl(finalPlan.decisions, 'https://example.com/legal-notice');
    expect(seed.plannedPasses.filter((p) => p === 'lighthouse')).toHaveLength(1);
    expect(seed.reasonCodes).toContain('operator-seed');
  });

  it('is invariant to input order', () => {
    const profiles = buildMotivatingFixture();
    const costs = new Map(profiles.map((p) => [p.url, makeCost(p.url)]));
    const forward = finalizeLighthousePlan(buildContentAuditPlan(profiles), costs);
    const shuffled = finalizeLighthousePlan(buildContentAuditPlan([...profiles].reverse()), costs);
    expect(shuffled.decisions).toEqual(forward.decisions);
  });

  it('never claims a finding or affected page: decisions carry only scheduling facts', () => {
    const profiles = buildMotivatingFixture();
    const finalPlan = finalizeLighthousePlan(
      buildContentAuditPlan(profiles),
      new Map(profiles.map((p) => [p.url, makeCost(p.url)])),
    );
    for (const decision of finalPlan.decisions) {
      expect(decision).not.toHaveProperty('findingId');
      expect(decision).not.toHaveProperty('findings');
      expect(decision).not.toHaveProperty('affectedPages');
    }
  });
});

describe('isConfirmedListing', () => {
  it('requires two independent listing signal kinds', () => {
    const twoSignals = profile('https://example.com/tag/a', listingSignals);
    expect(isConfirmedListing(twoSignals)).toBe(true);

    const oneSignal = profile('https://example.com/tag/b', [listingSignals[0]!]);
    expect(isConfirmedListing(oneSignal)).toBe(false);
  });

  it('does not count content, transactional, or homepage signals toward the listing threshold', () => {
    const contentOnly = profile('https://example.com/post-1', [contentSignal]);
    expect(isConfirmedListing(contentOnly)).toBe(false);

    const transactionalWithOneListingSignal = profile('https://example.com/reserver', [
      transactionalSignal,
      listingSignals[0]!,
    ]);
    expect(isConfirmedListing(transactionalWithOneListingSignal)).toBe(false);

    const homepage = profile('https://example.com/', [
      { kind: 'homepage-url', detail: 'https://example.com/' },
      listingSignals[0]!,
    ]);
    expect(isConfirmedListing(homepage)).toBe(false);
  });
});
