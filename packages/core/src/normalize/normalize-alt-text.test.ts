import { describe, expect, it } from 'vitest';
import {
  extractAltTextCandidates,
  ALT_TEXT_QUALITY_HEURISTIC_RULE_ID,
  ALT_TEXT_QUALITY_HEURISTIC_TITLE,
  type AltTextCheckInput,
  type ImageCheckInput,
} from './normalize-alt-text.js';

const PAGE_URL = 'https://example.com/';

function image(overrides: Partial<ImageCheckInput> = {}): ImageCheckInput {
  return {
    selector: 'img:nth-of-type(1)',
    alt: 'A vineyard at sunset',
    src: 'https://example.com/vineyard.jpg',
    isMarkedDecorative: false,
    width: 800,
    height: 600,
    ...overrides,
  };
}

function withImages(images: ImageCheckInput[]): AltTextCheckInput {
  return { pageUrl: PAGE_URL, images };
}

function reasons(candidates: ReturnType<typeof extractAltTextCandidates>): string[] {
  return candidates.map((c) => (c.rawEvidenceForPage as { reason: string }).reason);
}

describe('alt-text-quality-heuristic - clean regression', () => {
  it('does not fire for a normal, descriptive alt text', () => {
    expect(extractAltTextCandidates(withImages([image()]))).toEqual([]);
  });

  it('does not fire for a missing alt attribute at all (axe territory)', () => {
    expect(extractAltTextCandidates(withImages([image({ alt: null })]))).toEqual([]);
  });

  it('does not fire for empty alt on a properly marked decorative image', () => {
    expect(
      extractAltTextCandidates(withImages([image({ alt: '', isMarkedDecorative: true })])),
    ).toEqual([]);
  });

  it('does not fire for empty alt on a small image (likely icon/spacer)', () => {
    expect(
      extractAltTextCandidates(withImages([image({ alt: '', width: 16, height: 16 })])),
    ).toEqual([]);
  });

  it('does not judge an image whose final resource is still a placeholder', () => {
    expect(
      extractAltTextCandidates(withImages([image({ alt: 'IMG_1234.jpg', undetermined: true })])),
    ).toEqual([]);
  });
});

describe('filename-pattern alt text', () => {
  it.each(['IMG_4021.jpg', 'DSC00123.png', 'PXL_20240102.jpg', 'photo_001'])(
    'fires for "%s"',
    (alt) => {
      const candidates = extractAltTextCandidates(withImages([image({ alt })]));
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.ruleId).toBe(ALT_TEXT_QUALITY_HEURISTIC_RULE_ID);
      expect(candidates[0]?.category).toBe('accessibility');
      expect(candidates[0]?.severity).toBe('minor');
      expect(reasons(candidates)).toEqual(['filename-pattern']);
    },
  );
});

describe('generic placeholder alt text', () => {
  it.each(['image', 'Photo', 'PICTURE', 'icon'])('fires for "%s"', (alt) => {
    const candidates = extractAltTextCandidates(withImages([image({ alt })]));
    expect(reasons(candidates)).toEqual(['generic-placeholder']);
  });

  it('does not fire for a descriptive alt that merely contains a generic word', () => {
    expect(
      extractAltTextCandidates(withImages([image({ alt: 'A close-up photo of the estate' })])),
    ).toEqual([]);
  });
});

describe('empty alt on a non-decorative image', () => {
  it('fires for a large image with alt="" and no decorative markers', () => {
    const candidates = extractAltTextCandidates(withImages([image({ alt: '' })]));
    expect(reasons(candidates)).toEqual(['empty-alt-non-decorative']);
  });
});

describe('duplicate alt text across different images', () => {
  it('fires for two images with identical alt but different src', () => {
    const candidates = extractAltTextCandidates(
      withImages([
        image({ selector: 'img:nth-of-type(1)', alt: 'Our vineyard', src: 'a.jpg' }),
        image({ selector: 'img:nth-of-type(2)', alt: 'Our vineyard', src: 'b.jpg' }),
      ]),
    );
    expect(candidates).toHaveLength(2);
    expect(reasons(candidates)).toEqual([
      'duplicate-alt-across-different-images',
      'duplicate-alt-across-different-images',
    ]);
  });

  it('does not fire for two images with identical alt and the same src (same image referenced twice)', () => {
    const candidates = extractAltTextCandidates(
      withImages([
        image({ selector: 'img:nth-of-type(1)', alt: 'Company logo', src: 'logo.png' }),
        image({ selector: 'img:nth-of-type(2)', alt: 'Company logo', src: 'logo.png' }),
      ]),
    );
    expect(candidates).toEqual([]);
  });

  it('does not fire for a single image (nothing to duplicate against)', () => {
    expect(extractAltTextCandidates(withImages([image({ alt: 'Our vineyard' })]))).toEqual([]);
  });

  it('is case-insensitive when grouping duplicates', () => {
    const candidates = extractAltTextCandidates(
      withImages([
        image({ selector: 'img:nth-of-type(1)', alt: 'Our Vineyard', src: 'a.jpg' }),
        image({ selector: 'img:nth-of-type(2)', alt: 'our vineyard', src: 'b.jpg' }),
      ]),
    );
    expect(candidates).toHaveLength(2);
  });
});

describe('heuristic finding title', () => {
  it('uses one broad title for every low-value alt-text signal', () => {
    const candidates = extractAltTextCandidates(
      withImages([
        image({ alt: '' }),
        image({ alt: 'Photo' }),
        image({ alt: 'IMG_4021.jpg' }),
        image({ selector: 'img:nth-of-type(4)', alt: 'Notre hôtel', src: 'a.jpg' }),
        image({ selector: 'img:nth-of-type(5)', alt: 'Notre hôtel', src: 'b.jpg' }),
      ]),
    );

    expect(new Set(candidates.map((candidate) => candidate.title))).toEqual(
      new Set([ALT_TEXT_QUALITY_HEURISTIC_TITLE]),
    );
  });
});

describe('multiple images handled independently', () => {
  it('only flags the images that actually have a quality issue', () => {
    const candidates = extractAltTextCandidates(
      withImages([
        image({ selector: 'img:nth-of-type(1)', alt: 'A beautiful sunset over the vineyard' }),
        image({ selector: 'img:nth-of-type(2)', alt: 'IMG_1234.jpg' }),
      ]),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element?.selector).toBe('img:nth-of-type(2)');
  });
});
