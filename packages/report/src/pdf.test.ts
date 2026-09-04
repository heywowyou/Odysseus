import { describe, expect, it } from 'vitest';
import {
  analyzePagedjsPages,
  describePagedjsStructuralFailure,
  extractAppendixTablePreambles,
  insertRepeatedTheadsIntoHtml,
  REPORT_PAGE_COUNT_WARNING_THRESHOLD,
  reportPageCountWarning,
  type AppendixTableSplitPoint,
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

describe('reportPageCountWarning', () => {
  it('stays silent at or below the 60 page threshold', () => {
    expect(reportPageCountWarning(REPORT_PAGE_COUNT_WARNING_THRESHOLD)).toBeUndefined();
    expect(reportPageCountWarning(1)).toBeUndefined();
  });

  it('warns above the threshold and carries the measured count with it', () => {
    expect(reportPageCountWarning(REPORT_PAGE_COUNT_WARNING_THRESHOLD + 1)).toEqual({
      pageCount: 61,
      threshold: 60,
    });
  });

  it('never warns for a legacy document without a measured page count', () => {
    expect(reportPageCountWarning(undefined)).toBeUndefined();
  });
});

function buildAppendixTableHtml(ruleId: string, rowIds: readonly string[]): string {
  const rows = rowIds
    .map(
      (id) =>
        `<tr id="annexref-${id}" style="break-inside:avoid"><td colspan="4">row ${id}</td></tr>`,
    )
    .join('');
  return (
    `<table style="width:100%" data-appendix-rule-id="${ruleId}">` +
    `<colgroup><col style="width:80px"></colgroup>` +
    `<thead><tr><th>ID</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`
  );
}

describe('extractAppendixTablePreambles', () => {
  it('extracts the opening markup up to and including <tbody> for each rule table', () => {
    const html = `<div>before</div>${buildAppendixTableHtml('rule-a', ['f001', 'f002'])}<div>after</div>`;
    const preambles = extractAppendixTablePreambles(html);
    expect(preambles.get('rule-a')).toBe(
      '<table style="width:100%" data-appendix-rule-id="rule-a">' +
        '<colgroup><col style="width:80px"></colgroup>' +
        '<thead><tr><th>ID</th></tr></thead><tbody>',
    );
  });

  it('keeps only the first occurrence of a rule id already split into multiple tables', () => {
    const html =
      buildAppendixTableHtml('rule-a', ['f001']) +
      '</tbody></table>' +
      buildAppendixTableHtml('rule-a', ['f002']);
    const preambles = extractAppendixTablePreambles(html);
    expect(preambles.size).toBe(1);
    expect(preambles.get('rule-a')).toContain('<th>ID</th>');
  });
});

describe('insertRepeatedTheadsIntoHtml', () => {
  it('splits the table into two valid tables, cloning the header before the continuation row', () => {
    const html = buildAppendixTableHtml('rule-a', ['f001', 'f002', 'f003']);
    const preambles = extractAppendixTablePreambles(html);
    const splits: AppendixTableSplitPoint[] = [
      { ruleId: 'rule-a', continuationRowId: 'annexref-f002' },
    ];

    const patched = insertRepeatedTheadsIntoHtml(html, splits, preambles);

    // Exactly one extra <table>/<thead> pair was introduced, and the
    // continuation row is now the first row after a fresh header.
    expect(patched.match(/<table /gu)).toHaveLength(2);
    expect(patched.match(/<thead>/gu)).toHaveLength(2);
    const secondTableStart = patched.indexOf('<table ', patched.indexOf('<table ') + 1);
    const continuationRowIndex = patched.indexOf('annexref-f002');
    expect(continuationRowIndex).toBeGreaterThan(secondTableStart);
    expect(patched.indexOf('annexref-f001')).toBeLessThan(secondTableStart);
  });

  it('leaves the html untouched when no rule id in the split matches a known preamble', () => {
    const html = buildAppendixTableHtml('rule-a', ['f001', 'f002']);
    const preambles = extractAppendixTablePreambles(html);
    const splits: AppendixTableSplitPoint[] = [
      { ruleId: 'rule-unknown', continuationRowId: 'annexref-f002' },
    ];

    expect(insertRepeatedTheadsIntoHtml(html, splits, preambles)).toBe(html);
  });

  it('leaves the html untouched when the continuation row id cannot be found', () => {
    const html = buildAppendixTableHtml('rule-a', ['f001', 'f002']);
    const preambles = extractAppendixTablePreambles(html);
    const splits: AppendixTableSplitPoint[] = [
      { ruleId: 'rule-a', continuationRowId: 'annexref-missing' },
    ];

    expect(insertRepeatedTheadsIntoHtml(html, splits, preambles)).toBe(html);
  });

  it('applies more than one split point across a table with three fragments', () => {
    const html = buildAppendixTableHtml('rule-a', ['f001', 'f002', 'f003']);
    const preambles = extractAppendixTablePreambles(html);
    const splits: AppendixTableSplitPoint[] = [
      { ruleId: 'rule-a', continuationRowId: 'annexref-f002' },
      { ruleId: 'rule-a', continuationRowId: 'annexref-f003' },
    ];

    const patched = insertRepeatedTheadsIntoHtml(html, splits, preambles);

    expect(patched.match(/<table /gu)).toHaveLength(3);
    expect(patched.match(/<thead>/gu)).toHaveLength(3);
    // Every table/tbody pair opened is balanced by a closing tag.
    expect(patched.match(/<table /gu)?.length).toBe(patched.match(/<\/table>/gu)?.length);
  });
});
