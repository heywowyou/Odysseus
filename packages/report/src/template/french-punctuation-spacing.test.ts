/**
 * Issue #46: French high punctuation (?, !, :, ;), like guillemets, must
 * sit on a no-break space (U+00A0), never an ordinary U+0020. An ordinary
 * space is a legal line-break opportunity, so a long line can wrap right
 * before the mark and orphan it at the start of the next line: a delivered
 * report printed the cover's decision question with the "?" alone on its
 * own line, exactly this failure.
 *
 * U+00A0 rather than U+202F, for the same reason guillemet-spacing.test.ts
 * documents for guillemets: U+202F risks a missing glyph in the
 * print-to-PDF text layer, and a slightly wide space is the better loss.
 *
 * Scans the French strings surface (strings/fr.ts), the file whose every
 * content line is user-facing French copy. English copy (en.ts) puts no
 * space before punctuation at all, so there is nothing to guard there.
 * The decision question itself is a separate shared constant
 * (generic-question.ts, mirrored in core), outside this file's reach.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FR_STRINGS_PATH = path.resolve(__dirname, 'strings/fr.ts');

const NO_BREAK_SPACE = '\u00A0';

describe('French high punctuation never follows a breakable space', () => {
  it('uses a no-break space before every ?, !, : and ; in the French strings', async () => {
    const content = await fs.readFile(FR_STRINGS_PATH, 'utf-8');
    const offenders: { line: number; context: string }[] = [];
    let guardedOccurrences = 0;

    content.split('\n').forEach((line, index) => {
      // Whole-line comments document the strings; they are not copy.
      if (line.trimStart().startsWith('//')) return;
      for (const match of line.matchAll(/[?:;!]/g)) {
        const i = match.index ?? 0;
        if (i === 0) continue;
        const before = line[i - 1]!;
        if (before === NO_BREAK_SPACE) {
          guardedOccurrences++;
          continue;
        }
        // JavaScript \s matches U+00A0 too, so the equality above is what
        // spares the one legal predecessor; any other whitespace before
        // high punctuation is a breakable space and fails here.
        if (/\s/.test(before)) {
          offenders.push({ line: index + 1, context: line.slice(Math.max(0, i - 20), i + 20) });
        }
      }
    });

    // Non-vacuous: the French strings really do use the rule.
    expect(guardedOccurrences).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
