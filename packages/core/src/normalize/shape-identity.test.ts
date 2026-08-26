/**
 * 2026-08-25. The template-shape identity for axe element rules.
 *
 * Every case here is drawn from real scanner output on the review sites,
 * including the ones that must NOT merge - those are the ones that make the
 * rule safe rather than merely effective.
 */
import { describe, it, expect } from 'vitest';
import { shapeIdentity, extractAxeCandidates } from './normalize-axe.js';

const PAGE = 'https://www.lagnonu.fr/';

describe('shapeIdentity', () => {
  it('gives two gallery links from one template the same identity, despite different hrefs', () => {
    const a = shapeIdentity(
      '<a data-fancybox="gallery-15" href="/uploads/9ee45.jpg" data-caption="">',
    );
    const b = shapeIdentity(
      '<a data-fancybox="gallery-28" href="/uploads/0583.jpg" data-caption="">',
    );
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it('gives two navigation links from one menu the same identity', () => {
    expect(shapeIdentity('<a href="/en/press" class="link "></a>')).toBe(
      shapeIdentity('<a href="/fr/contact" class="link "></a>'),
    );
  });

  it('separates a different class on the same tag', () => {
    expect(shapeIdentity('<a href="/x" class="link"></a>')).not.toBe(
      shapeIdentity('<a href="/x" class="link active"></a>'),
    );
  });

  it('ignores inline style, which script commonly writes at runtime', () => {
    expect(shapeIdentity('<div class="description" style="height:40px">')).toBe(
      shapeIdentity('<div class="description">'),
    );
  });

  it('refuses to merge an element whose markup says nothing about its component', () => {
    // Only universal attributes and an empty class: this could be anything.
    expect(shapeIdentity('<span class="">x</span>')).toBeUndefined();
    expect(shapeIdentity('<a href="#">x</a>')).toBeUndefined();
  });

  it('does not merge two tags that merely share a class-free attribute set', () => {
    expect(shapeIdentity('<button data-modal="a">')).not.toBe(shapeIdentity('<a data-modal="a">'));
  });

  it('is order-insensitive across attributes but not across their names', () => {
    expect(shapeIdentity('<a data-fancybox="g" href="/a">')).toBe(
      shapeIdentity('<a href="/b" data-fancybox="h">'),
    );
    expect(shapeIdentity('<a data-fancybox="g" href="/a">')).not.toBe(
      shapeIdentity('<a data-popup="g" href="/a">'),
    );
  });
});

describe('extractAxeCandidates template identity', () => {
  function violation(id: string, htmls: string[]) {
    return {
      violations: [
        {
          id,
          impact: 'serious',
          tags: ['wcag2a'],
          help: 'h',
          description: 'd',
          nodes: htmls.map((html, i) => ({
            html,
            target: [`x:nth-child(${i + 1})`],
            impact: 'serious',
          })),
        },
      ],
    };
  }

  it('applies the identity to an allowlisted rule', () => {
    const [a, b] = extractAxeCandidates(
      violation('link-name', [
        '<a data-fancybox="g1" href="/a">',
        '<a data-fancybox="g2" href="/b">',
      ]),
      PAGE,
    );
    expect(a?.dedupeIdentity).toBeDefined();
    expect(a?.dedupeIdentity).toBe(b?.dedupeIdentity);
  });

  it('leaves a rule off the allowlist alone, so its findings stay separate', () => {
    // Writing alt text is a separate editorial decision per image, so
    // image-alt is deliberately excluded (trade-off 30's own warning).
    const [a] = extractAxeCandidates(
      violation('image-alt', [
        '<img class="lazy" src="/a.jpg">',
        '<img class="lazy" src="/b.jpg">',
      ]),
      PAGE,
    );
    expect(a?.dedupeIdentity).toBeUndefined();
  });

  it('falls back to the container for a control whose own markup is not distinctive', () => {
    const [a] = extractAxeCandidates(
      violation('target-size', ['<a href="#" class="">1</a>']),
      PAGE,
    );
    // Non-distinctive shape, and this selector has no ancestor path either,
    // so the candidate keeps its own selector identity rather than merging.
    expect(a?.dedupeIdentity).toBeUndefined();
  });
});
