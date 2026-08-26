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

function altTextPage(url: string, images: Array<{ selector: string; alt: string | null; src: string }>): NormalizePageInput {
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
        { selector: '#swiper-wrapper-3bd6608a838df14e > div:nth-child(1) > img', alt: '', src: '/img/one.jpg' },
        { selector: '#swiper-wrapper-3bd6608a838df14e > div:nth-child(2) > img', alt: '', src: '/img/two.jpg' },
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

    expect(findings.length).toBeGreaterThan(1);
    expect(new Set(findings.map((f) => f.title)).size).toBe(findings.length);
  });

  it('collapses the same image across pages into one finding', () => {
    const findings = normalize([
      altTextPage('https://example.com/', [{ selector: 'footer > img', alt: '', src: '/img/logo.png' }]),
      altTextPage('https://example.com/about', [{ selector: 'footer > img', alt: '', src: '/img/logo.png' }]),
      altTextPage('https://example.com/contact', [{ selector: 'div > footer > img', alt: '', src: '/img/logo.png' }]),
    ]).filter((f) => f.ruleId === 'alt-text-quality-heuristic');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.pageUrls).toHaveLength(3);
  });
});

function axePage(url: string, nodes: Array<{ selector: string }>, ruleId = 'target-size'): NormalizePageInput {
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
            html: '<span></span>',
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

  it('never merges on a missing container', () => {
    // axe sometimes emits a bare selector with no ancestor path. Collapsing
    // those onto a shared empty identity would merge unrelated controls, the
    // same "never merge on absent data" rule the Lighthouse resource path
    // follows.
    const findings = normalize([
      axePage('https://example.com/', [
        { selector: 'span[aria-label="Go to slide 18"]' },
        { selector: 'span[aria-label="Go to slide 19"]' },
      ]),
      axePage('https://example.com/about', [
        { selector: 'span[aria-label="Go to slide 18"]' },
        { selector: 'span[aria-label="Go to slide 19"]' },
      ]),
    ]).filter((f) => f.ruleId === 'target-size');

    expect(findings).toHaveLength(2);
  });

  it('leaves other axe rules on selector identity', () => {
    const findings = normalize([
      axePage('https://example.com/', [{ selector: 'nav > a.one' }], 'link-name'),
      axePage('https://example.com/about', [{ selector: 'nav > a.two' }], 'link-name'),
    ]).filter((f) => f.ruleId === 'link-name');

    expect(findings).toHaveLength(2);
  });
});
