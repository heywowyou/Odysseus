import { describe, expect, it } from 'vitest';
import {
  analyzePagedjsPages,
  describePagedjsStructuralFailure,
  type PagedPageModel,
} from './pdf.js';

function check(pages: readonly PagedPageModel[]): string | undefined {
  return describePagedjsStructuralFailure(analyzePagedjsPages(pages));
}

describe('analyzePagedjsPages / describePagedjsStructuralFailure', () => {
  it('reports no failure for a normal multi-page document', () => {
    const pages: PagedPageModel[] = [
      { text: 'Cover page', atomicBlockTexts: [] },
      { text: 'Section one content', atomicBlockTexts: ['Card A'] },
      { text: 'Section two content', atomicBlockTexts: ['Card B'] },
    ];

    expect(check(pages)).toBeUndefined();
  });

  it('fails when an interior page is blank', () => {
    const pages: PagedPageModel[] = [
      { text: 'Cover page', atomicBlockTexts: [] },
      { text: 'Section one content', atomicBlockTexts: ['Card A'] },
      { text: '   ', atomicBlockTexts: [] },
      { text: 'Section two content', atomicBlockTexts: ['Card B'] },
    ];

    const message = check(pages);
    expect(message).toContain('blank interior page');
    expect(message).toContain('page 3 of 4');
  });

  it('allows a blank cover page (index 0) as an exemption', () => {
    const pages: PagedPageModel[] = [
      { text: '', atomicBlockTexts: [] },
      { text: 'Section one content', atomicBlockTexts: ['Card A'] },
      { text: 'Section two content', atomicBlockTexts: ['Card B'] },
    ];

    expect(check(pages)).toBeUndefined();
  });

  it("fails when an atomic block's text is duplicated across two different pages", () => {
    const pages: PagedPageModel[] = [
      { text: 'Cover page', atomicBlockTexts: [] },
      { text: 'Section one content', atomicBlockTexts: ['Glossary entry: WCAG'] },
      { text: 'Section two content', atomicBlockTexts: ['Glossary entry: WCAG'] },
    ];

    const message = check(pages);
    expect(message).toContain('rendered the same block twice');
    expect(message).toContain('Glossary entry: WCAG');
  });

  it('does not flag the same block text repeated within a single page', () => {
    const pages: PagedPageModel[] = [
      { text: 'Cover page', atomicBlockTexts: [] },
      { text: 'Section one content', atomicBlockTexts: ['f001', 'f001'] },
    ];

    expect(check(pages)).toBeUndefined();
  });
});
