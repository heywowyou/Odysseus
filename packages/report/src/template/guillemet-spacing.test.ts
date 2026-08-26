/**
 * A7a (2026-08-24): every French guillemet pair in the report used an
 * ordinary U+0020 on the inside ("« mentions legales »"), which is both
 * typographically wrong in French and a real layout defect - an ordinary
 * space is a legal line-break opportunity, so a quotation falling near the
 * end of a line could print its opening guillemet alone at the right margin
 * with the quoted words on the next line.
 *
 * U+00A0 (no-break space) rather than U+202F (narrow no-break space): U+202F
 * is the finer typographic choice, but it is not present in every fallback
 * font Chromium may reach for during print-to-PDF, and a missing glyph in the
 * PDF text layer is a worse outcome than a slightly wide space. The same
 * caution that produced REPORT_PDF_CHROMIUM_ARGS (trade-off 19) applies.
 *
 * Scans every source file rather than a hardcoded list, for the reason
 * spacing-tokens.test.ts's docblock gives.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..');

const NO_BREAK_SPACE = ' ';
const NARROW_NO_BREAK_SPACE = ' ';

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(full)));
    } else if (/\.(ts|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

function isAllowedInnerSpace(char: string | undefined): boolean {
  return char === NO_BREAK_SPACE || char === NARROW_NO_BREAK_SPACE;
}

describe('French guillemets never enclose a breakable space', () => {
  it('uses a no-break space on the inside of every guillemet pair', async () => {
    const files = await listSourceFiles(srcRoot);
    const offenders: { file: string; context: string }[] = [];
    let pairsChecked = 0;

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');

      for (const match of content.matchAll(/«(.)/gs)) {
        pairsChecked++;
        if (!isAllowedInnerSpace(match[1])) {
          offenders.push({
            file: path.relative(srcRoot, file),
            context: content.slice(Math.max(0, match.index - 20), match.index + 40),
          });
        }
      }

      for (const match of content.matchAll(/(.)»/gs)) {
        pairsChecked++;
        if (!isAllowedInnerSpace(match[1])) {
          offenders.push({
            file: path.relative(srcRoot, file),
            context: content.slice(Math.max(0, match.index - 40), match.index + 20),
          });
        }
      }
    }

    // Non-vacuous: the report really does quote things in French.
    expect(pairsChecked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
