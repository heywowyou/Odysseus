/**
 * D4 (2026-08-25, Lagnonu review). Duplication was the dominant defect of a
 * real 51-page report: 219 of its 282 findings were five rules, each
 * restating one instruction. Two of them are fixed here, both by giving the
 * rule a better identity than "where in the page this happened", never by
 * normalizing selectors - trade-off 3 rejected that, and trade-off 30
 * re-confirmed it against real counter-examples.
 */
import { describe, expect, it } from 'vitest';
import { normalizeAudit } from './normalize.js';
import type { NormalizePageInput } from './normalize.js';

function normalize(pages: NormalizePageInput[]) {
  return normalizeAudit({
    auditId: 'audit-1',
    startedAt: new Date('2026-08-25T00:00:00Z'),
    pages,
  } as unknown as Parameters<typeof normalizeAudit>[0]);
}

function altTextPage(
  url: string,
  images: Array<{ selector: string; alt: string | null; src: string }>,
): NormalizePageInput {
  return {
    url,
    altText: {
      pageUrl: url,
      images: images.map((image) => ({
        ...image,
        isMarkedDecorative: false,
        width: 400,
        height: 300,
      })),
    },
  } as unknown as NormalizePageInput;
}

describe('D4a: the alt-text heuristic collapses per reason, with the files named', () => {
  /** 95 findings and 12 of 51 report pages, one row per image, for a check
   *  the report itself presents as a signal to verify rather than a
   *  conformity failure. */
  it('reports one finding per distinct reason, not one per image', () => {
    const findings = normalize([
      altTextPage('https://example.com/', [
        { selector: '#a > img:nth-child(1)', alt: '', src: '/img/one.jpg' },
        { selector: '#a > img:nth-child(2)', alt: '', src: '/img/two.jpg' },
        { selector: '#a > img:nth-child(3)', alt: '', src: '/img/three.jpg' },
      ]),
    ]).filter((f) => f.ruleId === 'alt-text-quality-heuristic');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.occurrences).toBe(3);
  });

  it('names the image files, so a positional selector is not the only detail', () => {
    const findings = normalize([
      altTextPage('https://example.com/', [
        // The shape that made this urgent: a runtime-generated wrapper id,
        // which is unusable as a selector and unstable across scans.
        {
          selector: '#swiper-wrapper-3bd6608a838df14e > div:nth-child(1) > img',
          alt: '',
          src: '/img/one.jpg',
        },
        {
          selector: '#swiper-wrapper-3bd6608a838df14e > div:nth-child(2) > img',
          alt: '',
          src: '/img/two.jpg',
        },
      ]),
    ]).filter((f) => f.ruleId === 'alt-text-quality-heuristic');

    expect(findings[0]?.rawEvidence).toMatchObject({
      resourceUrls: ['/img/one.jpg', '/img/two.jpg'],
    });
  });

  /** Not collapsed rule-wide: "write alt text for this image" and "these
   *  images share one alt text" are different instructions, and trade-off 30
   *  is explicit that collapsing independent problems hides findings. */
  it('keeps different reasons apart', () => {
    const findings = normalize([
      altTextPage('https://example.com/', [
        { selector: '#a > img:nth-child(1)', alt: '', src: '/img/empty.jpg' },
        { selector: '#b > img:nth-child(1)', alt: 'Vue sur le golfe', src: '/img/dup-a.jpg' },
        { selector: '#b > img:nth-child(2)', alt: 'Vue sur le golfe', src: '/img/dup-b.jpg' },
      ]),
    ]).filter((f) => f.ruleId === 'alt-text-quality-heuristic');

    expect(findings.length).toBe(2);
    // Not the titles: every signal this rule covers deliberately shares one
    // broad title, so that no single signal is presented as the meaning of
    // the rule. What must stay distinct is the instruction each finding
    // carries, which is the reason.
    const reasons = findings.map(
      (f) =>
        (f.rawEvidence as { perPage?: Record<string, { reason?: string }> }).perPage?.[
          'https://example.com/'
        ]?.reason,
    );
    expect(new Set(reasons).size).toBe(findings.length);
  });

  it('collapses the same image across pages into one finding', () => {
    const findings = normalize([
      altTextPage('https://example.com/', [
        { selector: 'footer > img', alt: '', src: '/img/logo.png' },
      ]),
      altTextPage('https://example.com/about', [
        { selector: 'footer > img', alt: '', src: '/img/logo.png' },
      ]),
      altTextPage('https://example.com/contact', [
        { selector: 'div > footer > img', alt: '', src: '/img/logo.png' },
      ]),
    ]).filter((f) => f.ruleId === 'alt-text-quality-heuristic');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.pageUrls).toHaveLength(3);
  });
});

function axePage(
  url: string,
  nodes: Array<{ selector: string; html?: string }>,
  ruleId = 'target-size',
): NormalizePageInput {
  return {
    url,
    axe: {
      violations: [
        {
          id: ruleId,
          impact: 'serious',
          tags: ['wcag22aa', 'wcag258'],
          help: 'Touch targets must have sufficient size',
          description: 'Ensures touch targets are large enough',
          nodes: nodes.map((node) => ({
            target: [node.selector],
            html: node.html ?? '<span></span>',
            impact: 'serious',
          })),
        },
      ],
    },
  } as unknown as NormalizePageInput;
}

describe('D4b: target-size collapses per control group', () => {
  /** A real report listed this twenty one times over four annex pages: twenty
   *  were the pagination dots of one carousel, differing only by
   *  [aria-label="Go to slide N"]. One control group, one fix. */
  it('reports one finding for the controls of a single container', () => {
    const findings = normalize([
      axePage('https://example.com/', [
        { selector: '.elem_4-pagination > .swiper-pagination-bullet[aria-label="Go to slide 1"]' },
        { selector: '.elem_4-pagination > .swiper-pagination-bullet[aria-label="Go to slide 2"]' },
        { selector: '.elem_4-pagination > .swiper-pagination-bullet[aria-label="Go to slide 3"]' },
      ]),
      axePage('https://example.com/about', [
        { selector: '.elem_4-pagination > .swiper-pagination-bullet[aria-label="Go to slide 1"]' },
      ]),
    ]).filter((f) => f.ruleId === 'target-size');

    expect(findings).toHaveLength(1);
  });

  it('keeps separate containers separate, so two widgets are two fixes', () => {
    const findings = normalize([
      axePage('https://example.com/', [{ selector: '.slider-a > .bullet[aria-label="1"]' }]),
      axePage('https://example.com/about', [{ selector: '.slider-b > .bullet[aria-label="1"]' }]),
    ]).filter((f) => f.ruleId === 'target-size');

    expect(findings).toHaveLength(2);
  });

  it('never merges on a missing container across different scopes', () => {
    // axe sometimes emits a bare selector with no ancestor path. Collapsing
    // those onto a shared empty identity would merge unrelated controls, the
    // same "never merge on absent data" rule the Lighthouse resource path
    // follows. Two bare controls seen on two different pages are two
    // findings: neither the element's own markup nor its scope says they
    // are the same thing.
    const findings = normalize([
      axePage('https://example.com/', [{ selector: 'span[aria-label="Go to slide 18"]' }]),
      axePage('https://example.com/about', [{ selector: 'span[aria-label="Go to slide 19"]' }]),
    ]).filter((f) => f.ruleId === 'target-size');

    expect(findings).toHaveLength(2);
  });

  it('leaves other axe rules on selector identity', () => {
    const findings = normalize([
      axePage('https://example.com/', [{ selector: 'nav > a.one' }], 'aria-hidden-focus'),
      axePage('https://example.com/about', [{ selector: 'nav > a.two' }], 'aria-hidden-focus'),
    ]).filter((f) => f.ruleId === 'aria-hidden-focus');

    expect(findings).toHaveLength(2);
  });

  // Plan 075 Q6: Les Criquets's carousel slides are bare anchors that only
  // their position tells apart, 64 findings for about six components.
  it.each(['link-name', 'button-name'])(
    'reports %s as one site-wide finding with every occurrence kept',
    (ruleId) => {
      const findings = normalize([
        axePage(
          'https://example.com/',
          [
            { selector: '.cloned.owl-item:nth-child(4) > a[href=""]' },
            { selector: '#menulogo > a' },
          ],
          ruleId,
        ),
        axePage(
          'https://example.com/seminaires',
          [{ selector: '.container-instit:nth-child(2) > .container > .slider > a' }],
          ruleId,
        ),
      ]).filter((f) => f.ruleId === ruleId);

      expect(findings).toHaveLength(1);
      expect(findings[0]!.occurrences).toBe(3);
      expect(findings[0]!.pageUrls).toHaveLength(2);
    },
  );
});

// Plan 075 I2, on Hotel Europe's stored tab component: axe named one
// element with a short and a long selector, which made two critical
// findings for each rule.
describe('ARIA role rules identify the component by its markup', () => {
  const tabs = '<div class="tabPanel js-apyTab customTabs" role="tabs">';
  const tablist = '<ul role="tablist" class="tabPanel-list">';

  it.each([
    ['aria-roles', tabs],
    ['aria-required-children', tablist],
  ])('reports one %s finding for one component named two ways', (ruleId, html) => {
    const findings = normalize([
      axePage('https://example.com/en/access.html', [{ selector: '.tabPanel', html }], ruleId),
      axePage(
        'https://example.com/en/tourism.html',
        [{ selector: '.invert > .panel-wrapper > .panel-text > .tabPanel', html }],
        ruleId,
      ),
    ]).filter((f) => f.ruleId === ruleId);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.occurrences).toBe(2);
  });

  it('keeps a page root out of shape identity, whose classes change per page', () => {
    // Atlantic Hôtel's jQuery UI accordion writes role="tablist" on <body>;
    // keyed by its per-page classes it became 54 findings over 109 pages.
    const findings = normalize([
      axePage(
        'https://example.com/en/breaks.html',
        [{ selector: 'body', html: '<body class="page en ui-accordion" role="tablist">' }],
        'aria-required-children',
      ),
      axePage(
        'https://example.com/fr/sejours.html',
        [{ selector: 'body', html: '<body class="page fr sejours ui-accordion" role="tablist">' }],
        'aria-required-children',
      ),
    ]).filter((f) => f.ruleId === 'aria-required-children');

    expect(findings).toHaveLength(1);
  });
});

function imagePage(
  url: string,
  images: Array<{ selector: string; src: string }>,
  ruleId = 'image-alt',
): NormalizePageInput {
  return {
    url,
    axe: {
      violations: [
        {
          id: ruleId,
          impact: 'critical',
          tags: ['wcag2a', 'wcag111'],
          help: 'Images must have alternate text',
          description: 'Ensures <img> elements have alternate text',
          nodes: images.map((image) => ({
            target: [image.selector],
            html: `<img src="${image.src}">`,
            impact: 'critical',
          })),
        },
      ],
    },
  } as unknown as NormalizePageInput;
}

/**
 * Issue #292. A 24-page Villas Foch audit reported 232 findings, 176 of them
 * critical, because a gallery present on every page produced one image-alt
 * finding per image. The annex then spent about 30 pages on the near-identical
 * rows, 168 of which ended by pointing at the first one's page list - the
 * report's own evidence that they all covered the same scope.
 */
describe('findings covering the same scope for one rule are one problem (issue #292)', () => {
  const gallery = [
    { selector: '#gallery > img:nth-child(1)', src: '/img/one.jpg' },
    { selector: '#gallery > img:nth-child(2)', src: '/img/two.jpg' },
    { selector: '#gallery > img:nth-child(3)', src: '/img/three.jpg' },
  ];

  it('collapses one rule repeated over the same pages, and counts every occurrence', () => {
    const findings = normalize([
      imagePage('https://example.com/', gallery),
      imagePage('https://example.com/about', gallery),
      imagePage('https://example.com/contact', gallery),
    ]).filter((f) => f.ruleId === 'image-alt');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.occurrences).toBe(9);
    expect(findings[0]?.pageUrls).toHaveLength(3);
  });

  it('names the image files, since one row now stands for every image', () => {
    const findings = normalize([
      imagePage('https://example.com/', gallery),
      imagePage('https://example.com/about', gallery),
    ]).filter((f) => f.ruleId === 'image-alt');

    expect(findings[0]?.rawEvidence).toMatchObject({
      resourceUrls: [
        'https://example.com/img/one.jpg',
        'https://example.com/img/three.jpg',
        'https://example.com/img/two.jpg',
      ],
    });
  });

  /** hotelchateauroyal.nc: four unnamed links on all 209 pages merged into
   *  one link-name finding of 1,881 occurrences, but its 20 examples were all
   *  the first link, the menu trigger (209 occurrences). The TripAdvisor and
   *  Kayak badges behind 1,254 of them were never shown. */
  it('shows every merged element among the examples, not only the first', () => {
    const pages = Array.from({ length: 25 }, (_, index) =>
      imagePage(`https://example.com/page-${index}`, gallery),
    );
    const [finding] = normalize(pages).filter((f) => f.ruleId === 'image-alt');

    expect(finding?.occurrences).toBe(75);
    expect(finding?.elements).toHaveLength(20);
    expect(new Set(finding?.elements.map((element) => element.selector))).toEqual(
      new Set(gallery.map((image) => image.selector)),
    );
  });

  it('keeps a different scope apart, so a one-page defect is not folded into a site-wide one', () => {
    const findings = normalize([
      imagePage(
        'https://example.com/',
        [...gallery, { selector: '#hero > img', src: '/img/hero.jpg' }],
        'role-img-alt',
      ),
      imagePage('https://example.com/about', gallery, 'role-img-alt'),
    ]).filter((f) => f.ruleId === 'role-img-alt');

    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.pageUrls.length).sort()).toEqual([1, 2]);
  });

  it('makes image-alt one site-wide finding, whatever pages each image sits on', () => {
    // Plan 075 Q5. Villas Foch: 226 images without alt stayed 14 findings
    // over different page sets under the scope rule above.
    const findings = normalize([
      imagePage('https://example.com/', [
        ...gallery,
        { selector: '#hero > img', src: '/img/hero.jpg' },
      ]),
      imagePage('https://example.com/about', gallery),
      imagePage('https://example.com/rooms', [{ selector: '#room > img', src: '/img/room.jpg' }]),
    ]).filter((f) => f.ruleId === 'image-alt');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.occurrences).toBe(8);
    expect(findings[0]?.pageUrls).toHaveLength(3);
    expect(findings[0]?.rawEvidence['resourceUrls']).toHaveLength(5);
  });

  it('shows each distinct image among the examples of the site-wide finding', () => {
    // Whistler Paris: the same four footer images on every page filled all 20
    // examples with repeats, and three of its seven images were never shown.
    const footer = [
      { selector: 'a[aria-label="one"] > img', src: 'data:image/png;base64,AAAA' },
      { selector: 'a[aria-label="two"] > img', src: 'data:image/png;base64,BBBB' },
    ];
    const pages = Array.from({ length: 25 }, (_, index) =>
      imagePage(`https://example.com/page-${index}`, footer),
    );
    pages.push(
      imagePage('https://example.com/last', [{ selector: '#rare > img', src: '/img/rare.jpg' }]),
    );
    const [finding] = normalize(pages).filter((f) => f.ruleId === 'image-alt');

    expect(finding?.occurrences).toBe(51);
    expect(new Set(finding?.elements.map((element) => element.snippet))).toEqual(
      new Set([
        '<img src="data:image/png;base64,AAAA">',
        '<img src="data:image/png;base64,BBBB">',
        '<img src="/img/rare.jpg">',
      ]),
    );
  });

  it('collapses one rule split per control, where each control sits on the same pages', () => {
    // Haaitza: target-size reported thirty times, one per menu item
    // (.menu-item-8267 > a, .menu-item-7780 > a...), each on the same two
    // pages. Thirty distinct containers, one menu, one size rule to apply.
    const menu = [
      { selector: '.menu-item-8267 > a' },
      { selector: '.menu-item-7780 > a' },
      { selector: '.menu-item-4021 > a' },
    ];
    const findings = normalize([
      axePage('https://example.com/', menu),
      axePage('https://example.com/about', menu),
    ]).filter((f) => f.ruleId === 'target-size');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.occurrences).toBe(6);
  });
});
