/**
 * Issue #82: several label rows (`Complexity : Low`, `Pages : ...`,
 * `Files : ...`) hardcoded French colon spacing (` : `) directly in
 * template markup, so the English report inherited it verbatim - 136
 * occurrences in one rendered PDF, next to correctly-closed English
 * strings a line away.
 *
 * `labelSeparator` (html-utils.ts) is now the one place that joins a
 * label to its colon, language-aware. This guards against a future call
 * site reintroducing a literal ` : ` next to a template interpolation
 * instead of going through it - the exact shape of the original defect.
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

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(full)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('label rows never hardcode French colon spacing', () => {
  it('never joins a template interpolation to a following one with a literal " : "', async () => {
    const files = await listSourceFiles(srcRoot);
    const offenders: { file: string; context: string }[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      for (const match of content.matchAll(/\}\s:\s\$\{/g)) {
        offenders.push({
          file: path.relative(srcRoot, file),
          context: content.slice(Math.max(0, match.index - 40), match.index + 20),
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
