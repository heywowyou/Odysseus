/**
 * report-feedback-palais-gallien.md item 6, [NEW]: 0.08-0.14em
 * letter-spacing on uppercase-tracked labels (nocturne.css's h6 and
 * .card-kicker, paged.css's @page margin boxes, and inline "headCell"-
 * style labels across packages/report/src/template/sections) caused
 * Chromium's print-to-PDF text layer to split words into separate
 * per-glyph text runs - extracting as e.g. "RAPPORT CONF I DE NTI E L",
 * which a screen reader reads letter by letter. Every one of those was
 * reduced to 0.02em, a value low enough to stay under whatever gap
 * threshold PDF text-extraction tools use to decide "insert a space
 * here", while still reading as intentional uppercase tracking.
 *
 * This is a static source-scan regression guard, not a live PDF-text-
 * extraction assertion: neither `pdftotext` nor a PDF-parsing library is
 * available in this environment (no poppler-utils installed, no sudo to
 * install it, and CLAUDE.md's scope-discipline rule forbids adding a new
 * dependency without asking first). A real `pdftotext` pass against a
 * regenerated report, checking for internal spaces inside uppercase
 * words, is still required as a manual verification step before this
 * fix is considered confirmed end to end - this test only guards against
 * the specific numeric regression (a future edit silently widening the
 * tracking back past the safe threshold).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..', '..');

/** Values at or below this are treated as safe against Chromium's
 *  print-to-PDF text-run splitting, per the reduction applied for item 6
 *  (every prior 0.06em-0.14em site was brought down to 0.02em). */
const SAFE_LETTER_SPACING_EM = 0.03;

function extractLetterSpacingValues(source: string): number[] {
  const values: number[] = [];
  const pattern = /letter-spacing:\s*(-?\d*\.?\d+)em/g;
  for (const match of source.matchAll(pattern)) {
    values.push(Number(match[1]));
  }
  return values;
}

async function readAllSourceFiles(): Promise<{ file: string; content: string }[]> {
  const targets = [
    'src/styles/nocturne.css',
    'src/styles/paged.css',
    'src/template/html-utils.ts',
    'src/template/sections/statistics.ts',
    'src/template/sections/core-web-vitals-table.ts',
    'src/template/sections/findings-appendix.ts',
    'src/template/sections/checklist.ts',
    'src/template/sections/cover.ts',
    'src/template/sections/executive-summary.ts',
    'src/template/sections/conformance-summary.ts',
    'src/template/sections/accessibility-statement.ts',
  ];
  return Promise.all(
    targets.map(async (relPath) => ({
      file: relPath,
      content: await fs.readFile(path.join(packageRoot, relPath), 'utf-8'),
    })),
  );
}

describe('item 6: no uppercase-tracking letter-spacing value regresses past the safe threshold', () => {
  it('every letter-spacing declaration in the report template/styles is at or below 0.03em (or negative, heading tracking)', async () => {
    const files = await readAllSourceFiles();
    const offenders: { file: string; value: number }[] = [];

    for (const { file, content } of files) {
      for (const value of extractLetterSpacingValues(content)) {
        if (value > SAFE_LETTER_SPACING_EM) {
          offenders.push({ file, value });
        }
      }
    }

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });
});
