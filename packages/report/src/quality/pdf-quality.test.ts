import { execFile, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  REQUIRED_PDF_TOOLS,
  canonicalPostProcessPdf,
  preflightPdfQualityToolchain,
  runExactPdfQa,
} from './pdf-quality.js';
import { bytesDigest, reportQualityDigest } from './digest.js';

const execFileAsync = promisify(execFile);

/** Probes a tool's presence synchronously so skip decisions are known at
 *  collection time. A present tool always runs its version query (poppler
 *  `-v` exits nonzero but executes); an absent binary surfaces as a spawn
 *  error (ENOENT here, EACCES under restricted sandboxes). */
function toolAvailable(tool: string): boolean {
  const result = spawnSync(tool, tool === 'qpdf' ? ['--version'] : ['-v']);
  return result.error === undefined && result.status !== null;
}

const availability: Record<string, boolean> = Object.fromEntries(
  REQUIRED_PDF_TOOLS.map((tool) => [tool, toolAvailable(tool)]),
);
const firstMissing: string | undefined = REQUIRED_PDF_TOOLS.find((tool) => !availability[tool]);
const popplerReady =
  availability['pdfinfo'] && availability['pdftotext'] && availability['pdffonts'];

/** Hand-written one-page PDF (A4, Helvetica, single text run) with a
 *  byte-exact xref table, so no generator dependency is needed. */
function buildMinimalPdf(): Buffer {
  const content = 'BT /F1 24 Tf 72 720 Td (Odysseus PDF QA fixture) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const startxref = body.length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'latin1');
}

describe('pdf quality toolchain gate (real binaries where installed)', () => {
  let workDir: string;
  let minimalPdfPath: string;

  beforeAll(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-pdf-qa-'));
    minimalPdfPath = path.join(workDir, 'minimal.pdf');
    await fs.writeFile(minimalPdfPath, buildMinimalPdf());
  });

  afterAll(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('fails closed naming the first missing required tool, or versions every tool', async () => {
    if (firstMissing) {
      await expect(preflightPdfQualityToolchain()).rejects.toThrow(
        `Required PDF quality tool failed: ${firstMissing}`,
      );
      return;
    }
    const versions = await preflightPdfQualityToolchain();
    expect(Object.keys(versions).sort()).toEqual([...REQUIRED_PDF_TOOLS].sort());
    for (const tool of REQUIRED_PDF_TOOLS) expect(versions[tool]).toBeTruthy();
  });

  it('refuses to run exact QA on a valid minimal PDF while the toolchain is incomplete', async () => {
    if (firstMissing) {
      await expect(
        runExactPdfQa({ pdfPath: minimalPdfPath, workDir, expectedPageCount: 1 }),
      ).rejects.toThrow(`Required PDF quality tool failed: ${firstMissing}`);
      return;
    }
    // With a complete toolchain the real gate must still fail closed on this
    // fixture: Helvetica is deliberately not embedded.
    await expect(
      runExactPdfQa({ pdfPath: minimalPdfPath, workDir, expectedPageCount: 1 }),
    ).rejects.toThrow('PDF QA found a non-embedded font');
  });

  it('rejects canonical post-process while qpdf is absent, or produces non-empty output', async () => {
    const outputPath = path.join(workDir, 'canonical.pdf');
    if (!availability['qpdf']) {
      await expect(
        canonicalPostProcessPdf(minimalPdfPath, outputPath, 'fr', 'Rapport de test'),
      ).rejects.toThrow('Required PDF quality tool failed: qpdf');
      return;
    }
    await canonicalPostProcessPdf(minimalPdfPath, outputPath, 'fr', 'Rapport de test');
    const bytes = await fs.readFile(outputPath);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('computes a stable gate digest that moves when any gate input moves', async () => {
    const pdf = await fs.readFile(minimalPdfPath);
    const pdfDigest = bytesDigest(pdf);
    const gatePayload = {
      pdfDigest,
      extractedTextDigest: bytesDigest(Buffer.from('Odysseus PDF QA fixture\n')),
      pageCount: 1,
      pageWidthPt: 595,
      pageHeightPt: 842,
      toolVersions: { qpdf: 'qpdf version 11.0.0', pdfinfo: 'pdfinfo version 24.02.0' },
    };
    expect(reportQualityDigest(gatePayload)).toBe(reportQualityDigest({ ...gatePayload }));
    expect(reportQualityDigest(gatePayload)).not.toBe(
      reportQualityDigest({ ...gatePayload, pageCount: 2 }),
    );
    expect(reportQualityDigest(gatePayload)).not.toBe(
      reportQualityDigest({
        ...gatePayload,
        extractedTextDigest: bytesDigest(Buffer.from('x')),
      }),
    );
    expect(pdfDigest).toBe(bytesDigest(await fs.readFile(minimalPdfPath)));
  });

  describe.skipIf(!popplerReady)('minimal PDF fixture sanity against installed poppler', () => {
    let fixturePath: string;

    beforeAll(async () => {
      fixturePath = path.join(workDir, 'fixture-sanity.pdf');
      await fs.writeFile(fixturePath, buildMinimalPdf());
    });

    it('is parsed by pdfinfo as one 595x842pt page, the fields the gate depends on', async () => {
      const { stdout } = await execFileAsync('pdfinfo', [fixturePath]);
      expect(stdout).toMatch(/^Pages:\s+1$/m);
      expect(stdout).toMatch(/^Page size:\s+595 x 842 pts/m);
    });

    it('carries a real text layer pdftotext can extract', async () => {
      const textPath = path.join(workDir, 'fixture-sanity.txt');
      await execFileAsync('pdftotext', ['-layout', fixturePath, textPath]);
      expect(await fs.readFile(textPath, 'utf8')).toContain('Odysseus PDF QA fixture');
    });

    it('shows its Helvetica as not embedded, which the font gate must reject', async () => {
      const { stdout } = await execFileAsync('pdffonts', [fixturePath]);
      expect(stdout).toMatch(/Helvetica/);
      expect(stdout).toMatch(/\bno\b/);
    });

    it('is rejected once truncated, like any corrupt buffer', async () => {
      const truncatedPath = path.join(workDir, 'truncated.pdf');
      await fs.writeFile(truncatedPath, buildMinimalPdf().subarray(0, 80));
      await expect(execFileAsync('pdfinfo', [truncatedPath])).rejects.toThrow();
    });
  });
});
