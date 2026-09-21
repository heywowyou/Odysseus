import { describe, expect, it } from 'vitest';
// jsdom ships no type declarations resolvable from this workspace, and
// adding one for a single test is not warranted; the test needs only the
// constructor and its window.document slice.
// @ts-expect-error - no declaration file for 'jsdom'
import { JSDOM } from 'jsdom';
import {
  anchorIsInSiteWideChrome,
  buildPageAuditProfile,
  classifyPageRoleSignals,
  hashTemplateFamily,
  templateSkeleton,
  type RawPageAuditFacts,
} from './page-audit-profile.js';

function facts(overrides: Partial<RawPageAuditFacts> = {}): RawPageAuditFacts {
  return {
    metaRobotsNoindex: false,
    jsonLdTypes: [],
    paginationRelNext: false,
    paginationRelPrev: false,
    numberedPaginationControlCount: 0,
    bodyClassTokens: [],
    transactionalFormSignalCount: 0,
    externalTransactionalLinkCount: 0,
    repeatedTeaserLinkGroupSize: 0,
    structuralTokens: [],
    ...overrides,
  };
}

describe('classifyPageRoleSignals', () => {
  it('returns no signals for a bare page', () => {
    expect(classifyPageRoleSignals(facts())).toEqual([]);
  });

  it('detects a transactional form regardless of other signals', () => {
    const signals = classifyPageRoleSignals(facts({ transactionalFormSignalCount: 1 }));
    expect(signals).toEqual([{ kind: 'transactional-form', detail: '1 form(s)' }]);
  });

  // Issue #86: a hotel site that hands booking off to a third-party PMS
  // has no same-document form at all, so this signal exists specifically
  // for that real-world case.
  it('detects an external transactional link regardless of other signals', () => {
    const signals = classifyPageRoleSignals(facts({ externalTransactionalLinkCount: 1 }));
    expect(signals).toEqual([{ kind: 'external-transactional-link', detail: '1 link(s)' }]);
  });

  it('deduplicates repeated listing class tokens into one signal', () => {
    const signals = classifyPageRoleSignals(
      facts({ bodyClassTokens: ['archive', 'category-archive', 'listing'] }),
    );
    expect(signals.filter((s) => s.kind === 'listing-structural-class')).toHaveLength(1);
  });

  it('reports both listing and content JSON-LD types when both are present', () => {
    const signals = classifyPageRoleSignals(
      facts({ jsonLdTypes: ['CollectionPage', 'Article', 'Organization'] }),
    );
    expect(signals).toContainEqual({ kind: 'listing-json-ld-type', detail: 'CollectionPage' });
    expect(signals).toContainEqual({ kind: 'content-json-ld-type', detail: 'Article' });
  });

  it('requires the repeated-teaser threshold before signaling', () => {
    expect(classifyPageRoleSignals(facts({ repeatedTeaserLinkGroupSize: 5 }))).not.toContainEqual(
      expect.objectContaining({ kind: 'repeated-teaser-links' }),
    );
    expect(classifyPageRoleSignals(facts({ repeatedTeaserLinkGroupSize: 6 }))).toContainEqual({
      kind: 'repeated-teaser-links',
      detail: '6',
    });
  });

  it('signals noindex robots', () => {
    expect(classifyPageRoleSignals(facts({ metaRobotsNoindex: true }))).toContainEqual({
      kind: 'noindex-robots',
      detail: 'noindex',
    });
  });

  it('signals pagination relations combined into one signal', () => {
    const signals = classifyPageRoleSignals(
      facts({ paginationRelNext: true, paginationRelPrev: true }),
    );
    expect(signals).toEqual([{ kind: 'pagination-relation', detail: 'next,prev' }]);
  });
});

describe('hashTemplateFamily', () => {
  it('returns undefined for an empty structural token stream', () => {
    expect(hashTemplateFamily([])).toBeUndefined();
  });

  it('is stable and deterministic for the same token stream', () => {
    const tokens = ['HEADER.site-header', 'MAIN.article-body', 'FOOTER.site-footer'];
    expect(hashTemplateFamily(tokens)).toBe(hashTemplateFamily([...tokens]));
  });

  it('differs for a different token stream', () => {
    expect(hashTemplateFamily(['HEADER.a'])).not.toBe(hashTemplateFamily(['HEADER.b']));
  });

  it('is versioned', () => {
    expect(hashTemplateFamily(['HEADER.a'])).toMatch(/^v2:/);
  });
});

describe('templateSkeleton', () => {
  // Shapes taken from two gallery posts of one WordPress template on a real
  // audited hotel site, which the raw token stream split into two families.
  const galleryPost = (postId: number, articleState: string, feedItems: string[]) => [
    'DIV[role=dialog].cmplz-cookiebanner.cmplz-show',
    'DIV[role=banner].',
    'HEADER.',
    'NAV[role=navigation].',
    'H1.title',
    'MAIN.sections_group',
    `ARTICLE.${articleState}.hentry.post-${postId}.type-rl_gallery`,
    'SECTION.mcb-section.section.the_content',
    'H2.entry-title',
    'SECTION.mcb-section.section.section-post-related',
    'FOOTER[role=contentinfo].mfn-footer',
    'DIV[role=list].',
    ...feedItems,
  ];

  it('groups two posts of one template despite post ids, post state, headings and feed items', () => {
    const a = galleryPost(919, 'no-img', ['DIV[role=listitem].sbi_type_image']);
    const b = galleryPost(918, 'has-post-thumbnail', [
      'DIV[role=listitem].sbi_type_video',
      'svg[role=presentation].fa-play',
    ]);
    expect(hashTemplateFamily(a)).toBe(hashTemplateFamily(b));
  });

  it('keeps landmarks and structural tags with their non-numeric classes', () => {
    expect(
      templateSkeleton([
        'DIV[role=banner].light.right',
        'NAV.menu-v2.menu-main',
        'DIV[role=button].close',
        'SPAN.icon',
        'ASIDE.widget.widget_media_image',
      ]),
    ).toEqual(['DIV[role=banner].light.right', 'NAV.menu-main', 'ASIDE.widget.widget_media_image']);
  });

  it('collapses consecutive identical elements into one block', () => {
    const blocks = (n: number) => ['MAIN.', ...Array<string>(n).fill('SECTION.room'), 'FOOTER.'];
    expect(hashTemplateFamily(blocks(4))).toBe(hashTemplateFamily(blocks(5)));
  });

  it('still separates templates whose skeletons differ', () => {
    expect(hashTemplateFamily(['MAIN.', 'SECTION.room', 'FOOTER.'])).not.toBe(
      hashTemplateFamily(['MAIN.', 'SECTION.room', 'ASIDE.booking', 'FOOTER.']),
    );
  });

  it('treats a page with only non-structural elements as having no family', () => {
    expect(hashTemplateFamily(['H1.title', 'DIV[role=listitem].card'])).toBeUndefined();
  });
});

describe('buildPageAuditProfile', () => {
  const baseContext = {
    url: 'https://example.com/post-1',
    isHomepage: false,
    isOperatorSeed: false,
  };

  it('carries the profile version and language', () => {
    const profile = buildPageAuditProfile(facts({ htmlLang: 'fr' }), baseContext);
    expect(profile.profileVersion).toBe('v2');
    expect(profile.language).toBe('fr');
    expect(profile.url).toBe('https://example.com/post-1');
  });

  it('omits language when the page declares none', () => {
    const profile = buildPageAuditProfile(facts(), baseContext);
    expect(profile).not.toHaveProperty('language');
  });

  it('marks the homepage with a leading signal', () => {
    const profile = buildPageAuditProfile(facts(), { ...baseContext, isHomepage: true });
    expect(profile.roleSignals[0]).toEqual({
      kind: 'homepage-url',
      detail: baseContext.url,
    });
  });

  it('marks an operator seed', () => {
    const profile = buildPageAuditProfile(facts(), { ...baseContext, isOperatorSeed: true });
    expect(profile.roleSignals).toContainEqual({
      kind: 'operator-seed',
      detail: baseContext.url,
    });
  });

  it('flags a canonical pointing elsewhere', () => {
    const profile = buildPageAuditProfile(
      facts({ canonicalHref: 'https://example.com/post-1-canonical' }),
      baseContext,
    );
    expect(profile.roleSignals).toContainEqual({
      kind: 'canonical-elsewhere',
      detail: 'https://example.com/post-1-canonical',
    });
  });

  it('does not flag a self-referencing canonical, ignoring a trailing slash', () => {
    const profile = buildPageAuditProfile(
      facts({ canonicalHref: 'https://example.com/post-1/' }),
      baseContext,
    );
    expect(profile.roleSignals).not.toContainEqual(
      expect.objectContaining({ kind: 'canonical-elsewhere' }),
    );
  });

  it('computes a template family id from structural tokens', () => {
    const profile = buildPageAuditProfile(
      facts({ structuralTokens: ['HEADER.a', 'MAIN.article'] }),
      baseContext,
    );
    expect(profile.templateFamilyId).toBeDefined();
  });

  it('omits template family id when there is no structural evidence', () => {
    const profile = buildPageAuditProfile(facts(), baseContext);
    expect(profile).not.toHaveProperty('templateFamilyId');
  });
});

// Issue #88: a booking link in site-wide chrome appears on every page, so
// it must contribute nothing to a page's transactional signal. These tests
// pin the exclusion predicate (and its selector vocabulary) that
// extractRawPageAuditFacts inlines inside its evaluate closure, which a
// unit test cannot execute directly.
describe('anchorIsInSiteWideChrome (issue #88)', () => {
  function jsdomAnchors(html: string): Element[] {
    const dom = new JSDOM(`<html><body>${html}</body></html>`) as {
      window: { document: { querySelectorAll(selectors: string): ArrayLike<Element> } };
    };
    return Array.from(dom.window.document.querySelectorAll('a[href]'));
  }

  it('excludes booking links in header, footer, nav, and ARIA landmark roles', () => {
    const anchors = jsdomAnchors(
      [
        '<header><a href="https://booking.example.com/h">Reserver un sejour</a></header>',
        '<footer><a href="https://booking.example.com/f">Reserver un sejour</a></footer>',
        '<nav><a href="https://booking.example.com/n">Reserver un sejour</a></nav>',
        '<div role="banner"><a href="https://booking.example.com/b">Reserver un sejour</a></div>',
        '<div role="navigation"><a href="https://booking.example.com/r">Reserver un sejour</a></div>',
        '<div role="contentinfo"><a href="https://booking.example.com/c">Reserver un sejour</a></div>',
      ].join(''),
    );
    expect(anchors).toHaveLength(6);
    for (const anchor of anchors) {
      expect(anchorIsInSiteWideChrome(anchor)).toBe(true);
    }
  });

  it('keeps a booking link that sits in the page content area', () => {
    const anchors = jsdomAnchors(
      '<main><p><a href="https://booking.example.com/w">Reserver un sejour</a></p></main>',
    );
    expect(anchors).toHaveLength(1);
    expect(anchorIsInSiteWideChrome(anchors[0]!)).toBe(false);
  });

  it('excludes through ancestry, not just the anchor itself', () => {
    const anchors = jsdomAnchors(
      '<header><div><span><a href="https://booking.example.com/d">Reserver un sejour</a></span></div></header>',
    );
    expect(anchorIsInSiteWideChrome(anchors[0]!)).toBe(true);
  });
});
