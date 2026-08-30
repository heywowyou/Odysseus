/**
 * Regression guard for a real defect found in a La Corniche report (this
 * session, 2026-08-22): `var(--space-5)` was referenced five times across
 * report-intro.ts and core-web-vitals-table.ts, but `--space-5` was never
 * defined anywhere in nocturne.css or the approved mockup. An undefined
 * CSS custom property computes to its property's initial value (`0` for
 * every margin/padding site here), so those five sites silently produced
 * zero spacing - the visible cause of a cramped section 01. Fixed by
 * replacing every site with `var(--space-6)`, the token the approved
 * mockup (docs/report/design/report-mockup-standalone.flat.html) actually uses
 * for the same "separate this block from
 * the next heading" role, confirmed by reading its computed styles via
 * the playwright MCP rather than inventing a new token.
 *
 * This test scans every .ts and .css file under src/, not a hardcoded
 * file list - letter-spacing.test.ts's own docblock already discloses
 * that its hardcoded list missed several template files, and this bug
 * lived in exactly that kind of blind spot for months.
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
    } else if (/\.(ts|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

function extractDeclaredTokens(cssSource: string): Set<string> {
  const declared = new Set<string>();
  for (const match of cssSource.matchAll(/(--space-[a-z0-9-]+)\s*:/g)) {
    declared.add(match[1]!);
  }
  return declared;
}

function extractReferencedTokens(source: string): string[] {
  const referenced: string[] = [];
  for (const match of source.matchAll(/var\((--space-[a-z0-9-]+)\)/g)) {
    referenced.push(match[1]!);
  }
  return referenced;
}

describe('every var(--space-*) reference in the report package resolves to a declared token', () => {
  it('never references an undefined --space-* custom property', async () => {
    const files = await listSourceFiles(srcRoot);
    const contents = await Promise.all(
      files.map(async (file) => ({ file, content: await fs.readFile(file, 'utf-8') })),
    );

    const declared = new Set<string>();
    for (const { content } of contents) {
      for (const token of extractDeclaredTokens(content)) declared.add(token);
    }
    expect(declared.size).toBeGreaterThan(0);

    const offenders: { file: string; token: string }[] = [];
    for (const { file, content } of contents) {
      for (const token of extractReferencedTokens(content)) {
        if (!declared.has(token)) {
          offenders.push({ file: path.relative(srcRoot, file), token });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
