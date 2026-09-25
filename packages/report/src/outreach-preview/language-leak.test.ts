import { describe, expect, it } from 'vitest';
import { generateOutreachPreviewHtmlV3 } from './render-html-v3.js';
import { outreachPreviewStringsV3 } from './strings-v3.js';
import { previewSummaryV3 } from './test-fixtures.js';

function render(language: 'fr' | 'en'): string {
  return generateOutreachPreviewHtmlV3(previewSummaryV3({ language }));
}

describe('a preview never carries the other language', () => {
  it.each([
    ['fr', 'en'],
    ['en', 'fr'],
  ] as const)('renders %s with no %s chrome', (language, other) => {
    const html = render(language);
    const otherStrings = outreachPreviewStringsV3(other);
    // Only distinctive sentences: short labels and the shared contact address
    // legitimately coincide between the two.
    for (const candidate of [
      otherStrings.lede,
      otherStrings.coverageIntro,
      otherStrings.prioritiesIntro,
      otherStrings.offerBody,
      otherStrings.privacyHeading,
    ]) {
      expect(html).not.toContain(candidate);
    }
  });

  it.each(['fr', 'en'] as const)('names no reference-stat provider in %s', (language) => {
    // Trade-off 16: outreach must not import the reference-stat table at all,
    // so a provider name here means one arrived by some other route.
    expect(render(language)).not.toMatch(/W3C|WebAIM|Forrester|Deloitte|Nielsen/u);
  });
});
