import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyDocumentWall, isChallengeTitle } from './host-signal.js';

interface CorpusRow {
  runKey: string;
  pageKey: string;
  httpStatus: number | null;
  renderedHttpStatus: number | null;
  renderedTitle: string | null;
  rawTextLength: number | null;
  renderedTextLength: number | null;
  rawMarkupLength: number | null;
  markerNames: string[];
  expectedClassification?: 'wall' | 'content';
}

const corpus = JSON.parse(
  readFileSync(
    new URL('../../../../fixtures/pushback-corpus/corpus.json', import.meta.url),
    'utf8',
  ),
) as { rows: CorpusRow[] };

function classifyRow(row: CorpusRow) {
  const status = row.renderedHttpStatus ?? row.httpStatus;
  const visibleTextLength = row.renderedTextLength ?? row.rawTextLength;
  return classifyDocumentWall({
    ...(status !== null ? { status } : {}),
    ...(row.renderedTitle !== null ? { title: row.renderedTitle } : {}),
    ...(row.rawMarkupLength !== null ? { markupLength: row.rawMarkupLength } : {}),
    ...(visibleTextLength !== null ? { visibleTextLength } : {}),
    markers: row.markerNames,
  });
}

describe('stored pushback corpus', () => {
  it('matches every labeled wall and content page with no content-to-wall false positives', () => {
    const labeled = corpus.rows.filter(
      (row): row is CorpusRow & { expectedClassification: 'wall' | 'content' } =>
        row.expectedClassification !== undefined,
    );
    expect(labeled.length).toBeGreaterThan(0);

    const mismatches: Array<{
      runKey: string;
      pageKey: string;
      expected: string;
      actual: string;
    }> = [];
    for (const row of labeled) {
      const result = classifyRow(row);
      if (result.classification !== row.expectedClassification) {
        mismatches.push({
          runKey: row.runKey,
          pageKey: row.pageKey,
          expected: row.expectedClassification,
          actual: result.classification,
        });
      }
    }

    expect(mismatches).toEqual([]);
    expect(
      labeled
        .filter((row) => row.expectedClassification === 'content')
        .every((row) => classifyRow(row).classification !== 'wall'),
    ).toBe(true);
  });

  it('keeps the fixture de-identified and stores ordinary titles only as hashes', () => {
    const serialized = JSON.stringify(corpus);
    expect(serialized).not.toMatch(/https?:\/\//iu);
    expect(serialized).not.toMatch(/<\/?[a-z!][^>]*>/iu);
    for (const row of corpus.rows) {
      expect(row.pageKey).toMatch(/^[a-f0-9]{16}$/u);
      expect(row.runKey).toMatch(/^[a-f0-9]{16}$/u);
      expect(row.renderedTitle === null || isChallengeTitle(row.renderedTitle)).toBe(true);
      expect(Object.keys(row)).not.toContain('url');
    }
  });
});
