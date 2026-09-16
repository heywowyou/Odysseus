import { describe, expect, it } from 'vitest';
import {
  normalizeReflow,
  REFLOW_HORIZONTAL_SCROLL_RULE_ID,
  type ReflowCheckInput,
} from './normalize-reflow.js';

const pageUrl = 'https://example.com/chambres';

function input(overrides: Partial<ReflowCheckInput> = {}): ReflowCheckInput {
  return {
    checked: true,
    requiresHorizontalScroll: true,
    documentScrollWidthPx: 540,
    viewportWidthPx: 320,
    overflowElements: [
      { selector: 'table.tarifs', widthPx: 540, snippet: '<table class="tarifs">' },
      { selector: 'img.hero', widthPx: 400, snippet: '<img class="hero">' },
    ],
    ...overrides,
  };
}

describe('normalizeReflow', () => {
  it.each([
    ['the check did not run', { checked: false }],
    ['the page reflows', { requiresHorizontalScroll: false }],
  ])('emits nothing when %s', (_label, overrides) => {
    expect(normalizeReflow(input(overrides), pageUrl)).toEqual([]);
  });

  it('emits one serious 1.4.10 finding anchored on the widest element', () => {
    const candidates = normalizeReflow(input(), pageUrl);
    expect(candidates).toHaveLength(1);
    const [finding] = candidates;
    expect(finding?.ruleId).toBe(REFLOW_HORIZONTAL_SCROLL_RULE_ID);
    expect(finding?.category).toBe('accessibility');
    expect(finding?.severity).toBe('serious');
    expect(finding?.wcagCriteria).toEqual(['1.4.10']);
    expect(finding?.element).toEqual({
      pageUrl,
      selector: 'table.tarifs',
      snippet: '<table class="tarifs">',
    });
    expect(finding?.description).toContain('320 CSS pixel');
    expect(finding?.description).toContain('540 pixels wide');
    expect(finding?.rawEvidenceForPage).toMatchObject({
      documentScrollWidthPx: 540,
      viewportWidthPx: 320,
    });
  });

  it('is page-scoped when no single element accounts for the overflow', () => {
    const [finding] = normalizeReflow(input({ overflowElements: [] }), pageUrl);
    expect(finding?.element).toBeNull();
    expect(finding?.description).toContain('page layout itself does not adapt');
  });
});
