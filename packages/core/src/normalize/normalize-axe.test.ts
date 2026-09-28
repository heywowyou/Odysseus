import { describe, expect, it } from 'vitest';
import {
  extractAxeCandidates,
  markupWithoutGeneratedIds,
  shapeIdentity,
  withoutRuntimeStateClasses,
} from './normalize-axe.js';
import { buildAxeNode, buildAxeResultsInput, buildAxeViolation } from './fixtures.js';

describe('extractAxeCandidates', () => {
  it('keeps ordinary security-check wording as a finding', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        nodes: [
          buildAxeNode({
            target: ['.security-note'],
            html: '<div>Security check options</div>',
            failureSummary: 'Fix the text that says security check.',
          }),
        ],
      }),
    ]);

    expect(extractAxeCandidates(axe, 'https://example.com/')).toHaveLength(1);
  });

  it('emits one candidate per (violation, node) pair', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        id: 'color-contrast',
        nodes: [buildAxeNode({ target: ['#a'] }), buildAxeNode({ target: ['#b'] })],
      }),
    ]);

    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.element?.selector)).toEqual(['#a', '#b']);
    expect(candidates.every((c) => c.source === 'axe')).toBe(true);
    expect(candidates.every((c) => c.category === 'accessibility')).toBe(true);
  });

  it('maps severity from node impact, falling back to violation impact', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        impact: 'moderate',
        nodes: [buildAxeNode({ impact: 'critical' }), buildAxeNode({ impact: null })],
      }),
    ]);

    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.severity).toBe('critical');
    // node impact null falls back to the violation's own impact
    expect(candidates[1]?.severity).toBe('moderate');
  });

  it('derives wcagCriteria from the violation tags', () => {
    const axe = buildAxeResultsInput([buildAxeViolation({ tags: ['wcag2aa', 'wcag143'] })]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.wcagCriteria).toEqual(['1.4.3']);
  });

  it('flattens shadow-DOM nested target arrays into one selector', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        nodes: [buildAxeNode({ target: ['#host', ['#inner', '.deep']] })],
      }),
    ]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.element?.selector).toBe('#host >>> #inner .deep');
  });

  it('preserves the full target array and impact in rawEvidenceForPage', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({ nodes: [buildAxeNode({ target: ['#a', ['#b']], impact: 'serious' })] }),
    ]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.rawEvidenceForPage['target']).toEqual(['#a', ['#b']]);
    expect(candidates[0]?.rawEvidenceForPage['impact']).toBe('serious');
  });

  it("uses axe's check outcome data for contrast and link identities", () => {
    const contrast = extractAxeCandidates(
      buildAxeResultsInput([
        buildAxeViolation({
          id: 'color-contrast',
          nodes: [
            buildAxeNode({
              target: ['#first'],
              any: [
                { data: { fgColor: '#777777', bgColor: '#ffffff', expectedContrastRatio: 4.5 } },
              ],
            }),
            buildAxeNode({
              target: ['#second'],
              any: [
                { data: { fgColor: '#777777', bgColor: '#ffffff', expectedContrastRatio: 4.5 } },
              ],
            }),
          ],
        }),
      ]),
      'https://example.com/',
    );
    expect(contrast[0]?.dedupeIdentity).toBe(contrast[1]?.dedupeIdentity);

    const link = extractAxeCandidates(
      buildAxeResultsInput([
        buildAxeViolation({
          id: 'link-in-text-block',
          nodes: [
            buildAxeNode({
              target: ['#first'],
              any: [
                {
                  data: { nodeColor: '#777777', parentColor: '#ffffff', requiredContrastRatio: 3 },
                },
              ],
            }),
            buildAxeNode({
              target: ['#second'],
              any: [
                {
                  data: { nodeColor: '#777777', parentColor: '#ffffff', requiredContrastRatio: 3 },
                },
              ],
            }),
          ],
        }),
      ]),
      'https://example.com/',
    );
    expect(link[0]?.dedupeIdentity).toBe(link[1]?.dedupeIdentity);
  });

  it('truncates long snippets to MAX_SNIPPET_LENGTH', () => {
    const longHtml = '<div>' + 'x'.repeat(1000) + '</div>';
    const axe = buildAxeResultsInput([
      buildAxeViolation({ nodes: [buildAxeNode({ html: longHtml })] }),
    ]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.element?.snippet.length).toBe(500);
  });

  it('returns an empty array for no violations', () => {
    expect(extractAxeCandidates(buildAxeResultsInput([]), 'https://example.com/')).toEqual([]);
  });
});

describe('embedded frame identity (plan 075, E2)', () => {
  const inFrame = (selector: string) =>
    buildAxeResultsInput([
      buildAxeViolation({
        id: 'image-alt',
        nodes: [
          buildAxeNode({ target: [selector, 'img.ytp-thumb'], html: '<img class="ytp-thumb">' }),
        ],
      }),
    ]);

  it('counts one embed once however axe names its iframe element', () => {
    const [a] = extractAxeCandidates(inFrame('iframe[width="560"]'), 'https://example.com/a');
    const [b] = extractAxeCandidates(inFrame('iframe[frameborder="0"]'), 'https://example.com/b');
    expect(a?.dedupeIdentity).toBeDefined();
    expect(a?.dedupeIdentity).toBe(b?.dedupeIdentity);
  });

  it('keeps embeds from different origins apart when the scanner recorded them', () => {
    const [youtube] = extractAxeCandidates(inFrame('#player'), 'https://example.com/', {
      frameOriginsBySelector: new Map([['#player', 'https://www.youtube.com']]),
    });
    const [vimeo] = extractAxeCandidates(inFrame('#player'), 'https://example.com/', {
      frameOriginsBySelector: new Map([['#player', 'https://player.vimeo.com']]),
    });
    expect(youtube?.dedupeIdentity).not.toBe(vimeo?.dedupeIdentity);
  });
});

describe('runtime state classes in identity (plan 075, F6)', () => {
  // color-contrast without axe's check data: every other axe rule is one
  // site-wide finding (plan 075 J1), so only a per-defect rule's fallback
  // still exercises the selector identity these cases are about.
  const node = (target: string[], html: string) =>
    buildAxeResultsInput([
      buildAxeViolation({ id: 'color-contrast', nodes: [buildAxeNode({ target, html })] }),
    ]);

  it('merges one footer image whose animation classes differed between pages', () => {
    const [a] = extractAxeCandidates(
      node(['.social-icon.fadeIn[target="_blank"]:nth-child(1) > img'], '<img src="/i.png">'),
      'https://example.com/a',
    );
    const [b] = extractAxeCandidates(
      node(['.social-icon.slower[target="_blank"]:nth-child(1) > img'], '<img src="/i.png">'),
      'https://example.com/b',
    );
    expect(a?.dedupeIdentity).toBeDefined();
    expect(a?.dedupeIdentity).toBe(b?.dedupeIdentity);
    expect(a?.element?.selector).toContain('.fadeIn');
  });

  it('merges one embedded player whose size-mode class differed between pages', () => {
    const player = (mode: string) =>
      node(
        ['iframe[frameborder="0"]', '#movie_player'],
        `<div class="html5-video-player ${mode}" id="movie_player">`,
      );
    const [small] = extractAxeCandidates(player('ytp-small-mode'), 'https://example.com/a');
    const [large] = extractAxeCandidates(player('ytp-large-width-mode'), 'https://example.com/b');
    expect(small?.dedupeIdentity).toBe(large?.dedupeIdentity);
  });

  it('leaves a selector with no state class on the default identity', () => {
    const [plain] = extractAxeCandidates(
      node(['#header-logo > img'], '<img src="/logo.png">'),
      'https://example.com/',
    );
    expect(plain?.dedupeIdentity).toBeUndefined();
  });
});

describe('contrast on inactive components (plan 075, F10)', () => {
  const contrast = (html: string) =>
    extractAxeCandidates(
      buildAxeResultsInput([
        buildAxeViolation({
          id: 'color-contrast',
          nodes: [buildAxeNode({ target: ['.x'], html })],
        }),
      ]),
      'https://example.com/',
    );

  it('drops an unavailable date in a booking calendar', () => {
    expect(
      contrast(
        '<span class="dp1820577600000 mphb-date-cell mphb-not-available-date" title="Indisponible">10</span>',
      ),
    ).toHaveLength(0);
  });

  it('drops an aria-disabled control', () => {
    expect(contrast('<a aria-disabled="true" href="#">Suivant</a>')).toHaveLength(0);
  });

  it('keeps an available date and ordinary text', () => {
    expect(contrast('<span class="mphb-date-cell mphb-available-date">11</span>')).toHaveLength(1);
    expect(contrast('<p>Texte gris</p>')).toHaveLength(1);
  });
});

describe('shapeIdentity on a snippet cut inside its opening tag', () => {
  it('ignores the cut attribute fragment', async () => {
    const { shapeIdentity } = await import('./normalize-axe.js');
    const full = '<a class="book-btn" href="#" fspanel-ctx-type="booking" fspanel-ctx-code="4301">';
    expect(shapeIdentity(full.slice(0, 62))).toBe(shapeIdentity(full.slice(0, 66)));
  });
});

describe('image-alt is one site-wide finding per frame origin (plan 075, Q5)', () => {
  const image = (target: string[], html: string) =>
    buildAxeResultsInput([
      buildAxeViolation({ id: 'image-alt', nodes: [buildAxeNode({ target, html })] }),
    ]);

  it('gives footer images named through a per-page link label one identity', () => {
    // Whistler Paris: the same pasted badge sat in a link whose aria-label was
    // a different SEO keyword on every page, and its src was a data: URI.
    const [a] = extractAxeCandidates(
      image(
        ['a[aria-label="hotel gare du nord"] > img'],
        '<img id="image_0" src="data:image/png;base6...">',
      ),
      'https://example.com/a',
    );
    const [b] = extractAxeCandidates(
      image(['a[aria-label="hotel paris 10"] > img'], '<img id="image_1" src="/logo.png">'),
      'https://example.com/b',
    );
    expect(a?.dedupeIdentity).toBe('site-wide');
    expect(b?.dedupeIdentity).toBe('site-wide');
  });

  it('keeps an image inside a third-party frame apart from the site-wide finding', () => {
    const [framed] = extractAxeCandidates(
      image(['iframe[src="https://maps.example.org/embed"]', 'img'], '<img src="/marker.svg">'),
      'https://example.com/',
    );
    expect(framed?.dedupeIdentity).toBe('frame:https://maps.example.org|site-wide');
  });
});

describe('runtime ids, state attributes and class order in identity (plan 075, H3)', () => {
  it('gives one Swiper list the same identity whatever id it was generated with', () => {
    expect(withoutRuntimeStateClasses('#swiper-wrapper-7162110913f1d271b')).toBe(
      withoutRuntimeStateClasses('#swiper-wrapper-ceb139b113f101052d'),
    );
  });

  it('keeps an authored id that only resembles a generated one', () => {
    expect(withoutRuntimeStateClasses('#swiper-wrapper-home')).toBe('#swiper-wrapper-home');
  });

  // Plan 075 J1, the stored shapes: Hotel Europe's form builder, Le 37 bis's
  // SVG-inlining script and Grand Hôtel Opéra's jQuery UI tab strip.
  it('reads a random field id and a random label reference as generated', () => {
    expect(withoutRuntimeStateClasses('#email-487784791')).toBe(
      withoutRuntimeStateClasses('#email-348380454'),
    );
    expect(withoutRuntimeStateClasses('svg[aria-labelledby="_r7krylvsd"]')).toBe(
      withoutRuntimeStateClasses('svg[aria-labelledby="_cwdhw1iyj"]'),
    );
  });

  it('keeps plain word, slug and short numbered ids', () => {
    expect(withoutRuntimeStateClasses('#popmake-12288')).toBe('#popmake-12288');
    expect(withoutRuntimeStateClasses('#main-menu')).toBe('#main-menu');
    expect(withoutRuntimeStateClasses('svg[aria-labelledby="logo-title"]')).toBe(
      'svg[aria-labelledby="logo-title"]',
    );
  });

  it('ignores the jQuery UI classes that mark the open or hovered tab', () => {
    expect(
      withoutRuntimeStateClasses('.ui-tabs-nav > .ui-tab.ui-tabs-active.ui-state-active > a'),
    ).toBe(withoutRuntimeStateClasses('.ui-tabs-nav > .ui-tab.ui-state-hover > a'));
  });

  it('blanks generated ids in markup so copies of one element read as one', () => {
    expect(markupWithoutGeneratedIds('<svg class="logo" aria-labelledby="_r7krylvsd">')).toBe(
      markupWithoutGeneratedIds('<svg class="logo" aria-labelledby="_ygr68hgvr">'),
    );
    expect(markupWithoutGeneratedIds('<svg id="brand-logo">')).toBe('<svg id="brand-logo">');
  });

  it('reads classes in any order as the same compound selector', () => {
    expect(
      withoutRuntimeStateClasses('.heroscreen > .isSlide.fullGallery > .fullGallery-remoteCont'),
    ).toBe(
      withoutRuntimeStateClasses('.heroscreen > .fullGallery.isSlide > .fullGallery-remoteCont'),
    );
  });

  it('leaves attribute values with spaces and dots intact while sorting classes', () => {
    expect(withoutRuntimeStateClasses('.b.a[aria-label="hotel paris 10.e"] > img')).toBe(
      '[aria-label="hotel paris 10.e"].a.b > img',
    );
  });

  it('ignores the current-page state Webflow adds to one link', () => {
    const home = shapeIdentity(
      '<a href="/?r=0" aria-current="page" class="navbar_logo w-inline-block w--current">',
    );
    const other = shapeIdentity('<a href="/?r=0" class="w-inline-block navbar_logo">');
    expect(home).toBeDefined();
    expect(home).toBe(other);
  });

  it('merges one slider button that axe named three ways', () => {
    const button = (target: string[]) =>
      extractAxeCandidates(
        buildAxeResultsInput([
          buildAxeViolation({
            id: 'button-name',
            nodes: [buildAxeNode({ target, html: '<button data-action="prev"></button>' })],
          }),
        ]),
        'https://example.com/',
      )[0]?.dedupeIdentity;
    const identities = new Set([
      button(['.heroscreen > .isSlide.fullGallery > .fullGallery-remoteCont > button']),
      button(['.heroscreen > .fullGallery.isSlide > .fullGallery-remoteCont > button']),
      button(['button[data-action="prev"]']),
    ]);
    expect(identities.size).toBe(1);
    expect([...identities][0]).toBeDefined();
  });
});

describe('aria-prohibited-attr identity survives truncation and optional settings (plan 075, H2)', () => {
  const cell = (html: string) =>
    extractAxeCandidates(
      buildAxeResultsInput([
        buildAxeViolation({
          id: 'aria-prohibited-attr',
          nodes: [
            buildAxeNode({
              target: ['#grid_cell-1'],
              html,
              failureSummary:
                'Fix all of the following:\n  aria-label attribute cannot be used on a div with no valid role attribute.',
            }),
          ],
        }),
      ]),
      'https://example.com/',
    )[0]?.dedupeIdentity;

  it('gives two cells of one CMS grid the same identity despite different optional settings', () => {
    // Whistler Paris: axe cut the class list and attribute list at different
    // points, and some cells carried extra per-cell settings.
    const slider = cell(
      '<div id="grid_cell-69067-1038..." class="grid_cell_wrapper wi..." grid-cell="69067-103847" data-background-slid...="1" ...>',
    );
    const image = cell(
      '<div id="grid_cell-290659-415..." class="grid_cell_wrapper wi..." hover-effect="zoom" aria-label="Basilique" data-valign="bottom" ...>',
    );
    expect(slider).toBeDefined();
    expect(slider).toBe(image);
  });

  it('reports another component in the same site-wide finding (plan 075 J1)', () => {
    expect(cell('<div class="grid_cell_wrapper wi..." aria-label="x">')).toBe(
      cell('<div class="gallery-item-media" aria-label="x">'),
    );
  });
});
