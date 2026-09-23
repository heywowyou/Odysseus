import { describe, expect, it } from 'vitest';
import { extractAxeCandidates } from './normalize-axe.js';
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
  const node = (target: string[], html: string) =>
    buildAxeResultsInput([
      buildAxeViolation({ id: 'image-alt', nodes: [buildAxeNode({ target, html })] }),
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
