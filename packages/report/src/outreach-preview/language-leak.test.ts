import { describe, expect, it } from 'vitest';
import { buildOutreachFactsBlock } from '@odysseus/core';
import { generateOutreachPreviewHtml } from './render-html.js';
import { previewTestInput } from './test-fixtures.js';
import { outreachPreviewStrings } from './strings.js';

function render(language: 'fr' | 'en'): string {
  return generateOutreachPreviewHtml(
    previewTestInput({
      language,
      facts: buildOutreachFactsBlock({
        assessment: undefined,
        language,
        capabilities: { argumentB: true },
      }),
    }),
  );
}

describe('a preview never carries the other language', () => {
  it.each([
    ['fr', 'en'],
    ['en', 'fr'],
  ] as const)('renders %s with no %s chrome', (language, other) => {
    const html = render(language);
    const otherStrings = outreachPreviewStrings(other);
    // Only distinctive sentences: short labels and the shared contact address
    // legitimately coincide between the two.
    for (const candidate of [
      otherStrings.heading,
      otherStrings.lede,
      otherStrings.observationsIntro,
      otherStrings.privacyHeading,
      otherStrings.offerHeading,
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
