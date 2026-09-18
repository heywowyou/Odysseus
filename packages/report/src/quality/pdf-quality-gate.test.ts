import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalPostProcessPdf, runExactPdfQa } from './pdf-quality.js';
import { bytesDigest, reportQualityDigest } from './digest.js';

/**
 * The exact-QA gate needs all six binaries (qpdf, poppler, mupdf). This
 * suite intercepts node:child_process so the gate's own orchestration can be
 * proven deterministically even where qpdf/mutool are not installed: the
 * fixture PDF is the hand-written minimal one, and every tool interaction is
 * answered by a canned dispatcher below. Real-binary behaviour lives in
 * pdf-quality.test.ts.
 */

const mockState = vi.hoisted(() => ({
  pdfFontsAllEmbedded: true,
  extractedText: 'Odysseus PDF QA fixture',
  writeMupdfPages: true,
  qpdfCheckPasses: true,
  qpdfWritesEmptyOutput: false,
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  type Callback = (error: Error | null, stdout?: string, stderr?: string) => void;
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==',
    'base64',
  );
  const fail = (callback: Callback, message: string, code = 1): void => {
    callback(Object.assign(new Error(message), { code }));
  };
  const sendVersion = (callback: Callback, tool: string, version: string): void => {
    callback(null, `${tool} version ${version}\n`, '');
  };
  const handle = async (command: string, args: string[], callback: Callback): Promise<void> => {
    try {
      if (command === 'qpdf') {
        if (args[0] === '--version') return sendVersion(callback, 'qpdf', '11.0.0-mock');
        if (args[0] === '--check') {
          if (!mockState.qpdfCheckPasses) return fail(callback, 'invalid xref', 3);
          const bytes = await fs.readFile(args.at(-1)!);
          const looksLikePdf =
            bytes.subarray(0, 5).toString('latin1') === '%PDF-' && bytes.includes('startxref');
          return looksLikePdf
            ? callback(null, '', '')
            : fail(callback, 'not a structurally valid PDF', 3);
        }
        // --deterministic-id --object-streams=generate --stream-data=compress in out
        const input = args.at(-2)!,
          output = args.at(-1)!;
        if (mockState.qpdfWritesEmptyOutput) await fs.writeFile(output, Buffer.alloc(0));
        else await fs.copyFile(input, output);
        return callback(null, '', '');
      }
      if (command === 'mutool') {
        if (args[0] === '-v') return sendVersion(callback, 'mutool', '1.24.0-mock');
        const pattern = args[args.indexOf('-o') + 1]!;
        if (mockState.writeMupdfPages) await fs.writeFile(pattern.replace('%d', '1'), PNG_1X1);
        return callback(null, '', '');
      }
      if (command === 'pdfinfo') {
        if (args[0] === '-v') return sendVersion(callback, 'pdfinfo', '24.02.0-mock');
        return callback(
          null,
          'Pages:           1\nPage size:      595 x 842 pts (A4)\nFile size:      979 bytes\n',
          '',
        );
      }
      if (command === 'pdftotext') {
        if (args[0] === '-v') return sendVersion(callback, 'pdftotext', '24.02.0-mock');
        await fs.writeFile(args.at(-1)!, mockState.extractedText);
        return callback(null, '', '');
      }
      if (command === 'pdffonts') {
        if (args[0] === '-v') return sendVersion(callback, 'pdffonts', '24.02.0-mock');
        const rows = mockState.pdfFontsAllEmbedded
          ? ['ABCDEF+Helvetica      Type 1C           WinAnsi          yes yes yes      8 0']
          : ['Helvetica            Type 1            WinAnsi          no  no  no       8 0'];
        return callback(
          null,
          `name                 type              encoding         emb sub uni object ID\n------------------------------- ----------------- ---------------- --- --- --- ---------\n${rows.join('\n')}\n`,
          '',
        );
      }
      if (command === 'pdftoppm') {
        if (args[0] === '-v') return sendVersion(callback, 'pdftoppm', '24.02.0-mock');
        await fs.writeFile(`${args.at(-1)!}-1.png`, PNG_1X1);
        return callback(null, '', '');
      }
      return fail(callback, `unexpected command in test dispatcher: ${command}`);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  };
  const fakeExecFile = (
    command: string,
    args: readonly string[],
    _options: unknown,
    callback: Callback,
  ): void => {
    void handle(command, args.map(String), callback);
  };
  // node's util.promisify(execFile) resolves {stdout, stderr} through
  // execFile's custom promisify symbol; mirror it so the gate's run()
  // helper destructures real output instead of a bare string.
  const runTool = (command: string, args: readonly string[]) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      void handle(command, args.map(String), (error, stdout, stderr) =>
        error ? reject(error) : resolve({ stdout: stdout ?? '', stderr: stderr ?? '' }),
      );
    });
  (fakeExecFile as unknown as Record<symbol, unknown>)[promisify.custom] = runTool;
  return { ...actual, execFile: fakeExecFile as unknown as typeof actual.execFile };
});

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

describe('runExactPdfQa orchestration (dispatched tools)', () => {
  let root: string;
  let pdfPath: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-pdf-gate-'));
    pdfPath = path.join(root, 'minimal.pdf');
    await fs.writeFile(pdfPath, buildMinimalPdf());
  });

  beforeEach(() => {
    mockState.pdfFontsAllEmbedded = true;
    mockState.extractedText = 'Odysseus PDF QA fixture';
    mockState.writeMupdfPages = true;
    mockState.qpdfCheckPasses = true;
    mockState.qpdfWritesEmptyOutput = false;
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('passes a structurally valid minimal PDF and reports every coverage field', async () => {
    const result = await runExactPdfQa({
      pdfPath,
      workDir: path.join(root, 'pass'),
      expectedPageCount: 1,
    });
    expect(result.pageCount).toBe(1);
    expect(result.pageWidthPt).toBe(595);
    expect(result.pageHeightPt).toBe(842);
    expect(result.pdfDigest).toBe(bytesDigest(await fs.readFile(pdfPath)));
    expect(result.extractedTextDigest).toBe(bytesDigest(Buffer.from(mockState.extractedText)));
    expect(result.coverage).toEqual({ popplerPages: 1, mupdfPages: 1, detailTiles: 2 });
    expect(result.popplerPages).toHaveLength(1);
    expect(result.mupdfPages).toHaveLength(1);
    expect(result.detailTiles).toHaveLength(1);
    const tiles = result.detailTiles[0]!;
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).not.toBe(tiles[1]);
    for (const tile of tiles) await expect(fs.access(tile)).resolves.toBeUndefined();
    expect(Object.keys(result.toolVersions)).toHaveLength(6);
  });

  it('returns the same gate digest for identical inputs and a different one when the text layer changes', async () => {
    const first = await runExactPdfQa({
      pdfPath,
      workDir: path.join(root, 'deterministic-a'),
      expectedPageCount: 1,
    });
    const second = await runExactPdfQa({
      pdfPath,
      workDir: path.join(root, 'deterministic-b'),
      expectedPageCount: 1,
    });
    expect(first.gateDigest).toBe(second.gateDigest);
    expect(first.gateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    mockState.extractedText = 'Different text layer';
    const changedText = await runExactPdfQa({
      pdfPath,
      workDir: path.join(root, 'deterministic-c'),
      expectedPageCount: 1,
    });
    expect(changedText.extractedTextDigest).not.toBe(first.extractedTextDigest);
    expect(changedText.gateDigest).not.toBe(first.gateDigest);
  });

  it('fails the gate on a corrupt, truncated PDF buffer', async () => {
    const truncatedPath = path.join(root, 'truncated.pdf');
    await fs.writeFile(truncatedPath, buildMinimalPdf().subarray(0, 80));
    await expect(
      runExactPdfQa({
        pdfPath: truncatedPath,
        workDir: path.join(root, 'corrupt'),
        expectedPageCount: 1,
      }),
    ).rejects.toThrow('Required PDF quality tool failed: qpdf');
  });

  it('rejects page-count drift before rasterizing', async () => {
    await expect(
      runExactPdfQa({ pdfPath, workDir: path.join(root, 'drift'), expectedPageCount: 2 }),
    ).rejects.toThrow('PDF page-count drift: expected 2, got 1');
  });

  it('rejects an empty text layer', async () => {
    mockState.extractedText = '   ';
    await expect(
      runExactPdfQa({ pdfPath, workDir: path.join(root, 'empty-text'), expectedPageCount: 1 }),
    ).rejects.toThrow('PDF text layer is empty');
  });

  it('rejects a non-embedded font', async () => {
    mockState.pdfFontsAllEmbedded = false;
    await expect(
      runExactPdfQa({ pdfPath, workDir: path.join(root, 'fonts'), expectedPageCount: 1 }),
    ).rejects.toThrow('PDF QA found a non-embedded font');
  });

  it('rejects when one engine fails to rasterize every page', async () => {
    mockState.writeMupdfPages = false;
    await expect(
      runExactPdfQa({ pdfPath, workDir: path.join(root, 'coverage'), expectedPageCount: 1 }),
    ).rejects.toThrow('PDF QA did not rasterize every page with both engines');
  });

  it('canonical post-process writes non-empty output and fails closed on empty output', async () => {
    const outputPath = path.join(root, 'canonical.pdf');
    await canonicalPostProcessPdf(pdfPath, outputPath, 'en', 'Test report');
    expect((await fs.readFile(outputPath)).length).toBeGreaterThan(0);

    mockState.qpdfWritesEmptyOutput = true;
    await expect(
      canonicalPostProcessPdf(pdfPath, path.join(root, 'canonical-empty.pdf'), 'en', 'Test report'),
    ).rejects.toThrow('Canonical PDF post-process produced empty en output for Test report');
  });
});

describe('gate digest determinism (pure)', () => {
  it('binds page geometry and tool versions into one canonical digest', () => {
    const toolVersions = { qpdf: 'qpdf version 11.0.0-mock', mutool: 'mutool version 1.24.0-mock' };
    const gate = (pageCount: number, pageWidthPt: number) =>
      reportQualityDigest({
        pdfDigest: bytesDigest(Buffer.from('pdf-bytes')),
        extractedTextDigest: bytesDigest(Buffer.from('text-layer')),
        pageCount,
        pageWidthPt,
        pageHeightPt: 842,
        toolVersions,
      });
    expect(gate(1, 595)).toBe(gate(1, 595));
    expect(gate(1, 595)).not.toBe(gate(2, 595));
    expect(gate(1, 595)).not.toBe(gate(1, 612));
    expect(gate(1, 595)).not.toBe(
      reportQualityDigest({
        pdfDigest: bytesDigest(Buffer.from('pdf-bytes')),
        extractedTextDigest: bytesDigest(Buffer.from('text-layer')),
        pageCount: 1,
        pageWidthPt: 595,
        pageHeightPt: 842,
        toolVersions: { ...toolVersions, qpdf: 'qpdf version 11.1.0-mock' },
      }),
    );
  });
});
