/**
 * Issue #557: the dashboard serves report PDFs from several routes, and some
 * were cacheable. Every one now goes through sendPdf, which sets no-store;
 * this keeps a new route from writing its own PDF headers.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routesDir = path.dirname(fileURLToPath(import.meta.url));

describe('PDF responses', () => {
  it('are written only by sendPdf', async () => {
    const files = (await readdir(routesDir)).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    );
    const writers: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(routesDir, file), 'utf8');
      const count = source.split("'content-type', 'application/pdf'").length - 1;
      for (let i = 0; i < count; i += 1) writers.push(file);
    }
    expect(writers).toEqual(['audits.ts']);
    const audits = await readFile(path.join(routesDir, 'audits.ts'), 'utf8');
    expect(audits).toMatch(
      /function sendPdf\([\s\S]*?'content-type', 'application\/pdf'[\s\S]*?'private, no-store'/u,
    );
  });
});
