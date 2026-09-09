import { describe, expect, it } from 'vitest';
import {
  analyzePagedjsOverflow,
  analyzePagedjsPages,
  describePagedjsOverflow,
  describePagedjsStructuralFailure,
  extractAppendixTablePreambles,
  insertRepeatedTheadsIntoHtml,
  PAGEDJS_NEGLIGIBLE_BOX_PX,
  PAGEDJS_OVERFLOW_TOLERANCE_PX,
  reportPageCountWarning,
  REPORT_PAGE_COUNT_WARNING_THRESHOLD,
  type AppendixTableSplitPoint,
  type PagedOverflowCandidate,
  type PagedPageModel,
  type PagedPageOverflowModel,
  type PagedRect,
} from './pdf.js';

function page(
  text: string,
  atomicBlockTexts: string[] = [],
  overrides: Partial<Omit<PagedPageModel, 'text' | 'atomicBlockTexts'>> = {},
): PagedPageModel {
  return {
    text,
    atomicBlockTexts,
    renderAtomicMarkers: [],
    ...overrides,
  };
}

function check(pages: readonly PagedPageModel[]): string | undefined {
  return describePagedjsStructuralFailure(analyzePagedjsPages(pages));
}

describe('analyzePagedjsPages / describePagedjsStructuralFailure', () => {
  it('reports no failure for a normal multi-page document', () => {
    const pages: PagedPageModel[] = [
      page('Cover page'),
      page('Section one content', ['Card A']),
      page('Section two content', ['Card B']),
    ];

    expect(check(pages)).toBeUndefined();
  });

  it('fails when an interior page is blank', () => {
    const pages: PagedPageModel[] = [
      page('Cover page'),
      page('Section one content', ['Card A']),
      page('   '),
      page('Section two content', ['Card B']),
    ];

    const message = check(pages);
    expect(message).toContain('blank interior page');
    expect(message).toContain('page 3 of 4');
  });

  it('allows a blank cover page (index 0) as an exemption', () => {
    const pages: PagedPageModel[] = [
      page(''),
      page('Section one content', ['Card A']),
      page('Section two content', ['Card B']),
    ];

    expect(check(pages)).toBeUndefined();
  });

  it("fails when an atomic block's text is duplicated across two different pages", () => {
    const pages: PagedPageModel[] = [
      page('Cover page'),
      page('Section one content', ['Glossary entry: WCAG']),
      page('Section two content', ['Glossary entry: WCAG']),
    ];

    const message = check(pages);
    expect(message).toContain('rendered the same block twice');
    expect(message).toContain('Glossary entry: WCAG');
  });

  it('does not flag the same block text repeated within a single page', () => {
    const pages: PagedPageModel[] = [
      page('Cover page'),
      page('Section one content', ['f001', 'f001']),
    ];

    expect(check(pages)).toBeUndefined();
  });

  it('fails when one declared bounded render unit spans physical pages', () => {
    const message = check([
      page('Cover page'),
      page('Summary', [], { renderAtomicMarkers: ['start-here'] }),
      page('Summary continuation', [], { renderAtomicMarkers: ['start-here'] }),
    ]);

    expect(message).toContain('Declared bounded render unit "start-here"');
    expect(message).toContain('pages 2, 3 of 3');
  });

  it('allows a declared bounded unit that appears once on one physical page', () => {
    expect(
      check([page('Cover page'), page('Summary', [], { renderAtomicMarkers: ['start-here'] })]),
    ).toBeUndefined();
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

/** A 200x400 printable content rectangle (the coordinate space every case
 *  below shares) and a 100x50 painted box resting comfortably inside it. */
function overflowContentRect(overrides: Partial<PagedRect> = {}): PagedRect {
  return { left: 0, top: 0, right: 200, bottom: 400, width: 200, height: 400, ...overrides };
}

function overflowBox(overrides: Partial<PagedRect> = {}): PagedRect {
  return { left: 10, top: 10, right: 110, bottom: 60, width: 100, height: 50, ...overrides };
}

function paintedBox(overrides: Partial<PagedRect> = {}): PagedOverflowCandidate {
  return { tag: 'DIV', painted: true, rect: overflowBox(overrides) };
}

function overflowPageModel(
  candidates: readonly PagedOverflowCandidate[],
  pageIndex = 0,
  contentRect: PagedRect = overflowContentRect(),
): PagedPageOverflowModel {
  return { pageIndex, contentRect, candidates: [...candidates] };
}

describe('analyzePagedjsOverflow / describePagedjsOverflow (issue #118)', () => {
  it('stays silent when every painted box sits inside or exactly on the content rectangle', () => {
    const pages = [
      overflowPageModel([
        paintedBox({ left: 0, top: 0, right: 200, bottom: 400, width: 200, height: 400 }),
        paintedBox({ left: 200, top: 400, right: 200, bottom: 400, width: 0, height: 0 }),
      ]),
    ];
    expect(analyzePagedjsOverflow(pages)).toBeUndefined();
  });

  it(`treats movement up to ${PAGEDJS_OVERFLOW_TOLERANCE_PX}px past the boundary as rounding noise`, () => {
    const pages = [
      overflowPageModel([
        // 18mm is not a whole number of print-resolution pixels, so a
        // fractional drift at the edge is routine; the tolerance exists
        // for exactly this and must not become a loophole.
        paintedBox({ right: 200 + PAGEDJS_OVERFLOW_TOLERANCE_PX, width: 191 }),
        paintedBox({ bottom: 400 + PAGEDJS_OVERFLOW_TOLERANCE_PX, height: 391 }),
      ]),
    ];
    expect(analyzePagedjsOverflow(pages)).toBeUndefined();
  });

  it('reports a right overflow with the physical page number, side, and measured amount', () => {
    const violation = analyzePagedjsOverflow([
      overflowPageModel([paintedBox({ left: 150, right: 230.4, width: 80.4 })]),
    ]);
    if (violation === undefined) throw new Error('expected the gate to report a violation');
    expect(violation).toEqual({ pageIndex: 0, tag: 'DIV', side: 'right', amountPx: 30.4 });
    expect(describePagedjsOverflow(violation)).toBe(
      'Painted content <div> extends past the printable content rectangle on physical page 1 at right by 30.4px.',
    );
  });

  it('reports left, bottom, and top overflows with their own side', () => {
    const left = analyzePagedjsOverflow([
      overflowPageModel([paintedBox({ left: -40, right: 60, width: 100 })]),
    ]);
    expect(left?.side).toBe('left');
    const bottom = analyzePagedjsOverflow([
      overflowPageModel([paintedBox({ top: 380, bottom: 430, height: 50 })]),
    ]);
    expect(bottom?.side).toBe('bottom');
    const top = analyzePagedjsOverflow([
      overflowPageModel([paintedBox({ top: -12, bottom: 38, height: 50 })]),
    ]);
    expect(top?.side).toBe('top');
  });

  it('reports the dominant right side for a box wider than the whole content rectangle', () => {
    const violation = analyzePagedjsOverflow([
      overflowPageModel([paintedBox({ left: -50, right: 250, width: 300 })]),
    ]);
    expect(violation?.side).toBe('right');
  });

  it('never fires for a box that cannot paint (hidden, display none, opacity 0)', () => {
    const pages = [
      overflowPageModel([
        { tag: 'DIV', painted: false, rect: overflowBox({ left: -100, right: 0, width: 100 }) },
        { tag: 'SPAN', painted: false, rect: overflowBox({ right: 320, width: 120 }) },
      ]),
    ];
    expect(analyzePagedjsOverflow(pages)).toBeUndefined();
  });

  it(`never fires for a negligible box below ${PAGEDJS_NEGLIGIBLE_BOX_PX}px on both axes`, () => {
    const pages = [
      overflowPageModel([
        // The hidden .footer-source anchor is 0x0 on purpose and a
        // rounding shard is nearly one. Neither paints anything
        // measurable, so neither may abort a deliverable.
        {
          tag: 'DIV',
          painted: true,
          rect: overflowBox({ left: 300, right: 300.4, width: 0.4, bottom: 10.4, height: 0.4 }),
        },
      ]),
    ];
    expect(analyzePagedjsOverflow(pages)).toBeUndefined();
  });

  it('still fires for a box that is negligible on one axis but real on the other', () => {
    const violation = analyzePagedjsOverflow([
      overflowPageModel([
        paintedBox({ left: 150, right: 230, width: 80, top: 0, bottom: 0.4, height: 0.4 }),
      ]),
    ]);
    if (violation === undefined) throw new Error('expected the gate to report a violation');
    expect(violation.side).toBe('right');
  });

  it('returns the first offender in document order across pages', () => {
    const violation = analyzePagedjsOverflow([
      overflowPageModel([paintedBox()]),
      overflowPageModel([paintedBox({ right: 999, width: 899 })], 1),
      overflowPageModel([paintedBox({ bottom: 999, height: 599 })], 2),
    ]);
    expect(violation?.pageIndex).toBe(1);
    expect(violation?.side).toBe('right');
  });

  it('skips a page whose content rectangle degenerated to zero instead of misreporting every box on it', () => {
    const pages = [
      overflowPageModel(
        [paintedBox({ right: 999, width: 899 })],
        0,
        overflowContentRect({ width: 0, right: 0 }),
      ),
      overflowPageModel([paintedBox()]),
    ];
    expect(analyzePagedjsOverflow(pages)).toBeUndefined();
  });
});
