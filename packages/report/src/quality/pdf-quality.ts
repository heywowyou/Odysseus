import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Sha256Digest } from '@odysseus/core';
import { bytesDigest, reportQualityDigest } from './digest.js';

const execFileAsync = promisify(execFile);
export const REQUIRED_PDF_TOOLS = ['qpdf', 'pdfinfo', 'pdftotext', 'pdffonts', 'pdftoppm', 'mutool'] as const;
export interface PdfQualityToolVersions { [tool: string]: string }
export interface ExactPdfQaResult {
  pdfDigest: Sha256Digest; pageCount: number; pageWidthPt: number; pageHeightPt: number;
  extractedTextDigest: Sha256Digest; gateDigest: Sha256Digest; coverage: { popplerPages: number; mupdfPages: number; detailTiles: number };
  toolVersions: PdfQualityToolVersions; popplerPages: string[]; mupdfPages: string[]; detailTiles: string[][];
}
async function run(command: string, args: string[]): Promise<string> {
  try { const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024 }); return String(stdout || stderr).trim(); }
  catch (error) { throw new Error(`Required PDF quality tool failed: ${command}: ${error instanceof Error ? error.message : String(error)}`); }
}
export async function preflightPdfQualityToolchain(): Promise<PdfQualityToolVersions> {
  const versions: PdfQualityToolVersions = {};
  for (const tool of REQUIRED_PDF_TOOLS) {
    const args = tool === 'qpdf' ? ['--version'] : tool === 'mutool' ? ['-v'] : ['-v'];
    versions[tool] = (await run(tool, args)).split('\n')[0] ?? 'unknown';
  }
  return versions;
}
export async function canonicalPostProcessPdf(inputPath: string, outputPath: string, language: 'fr' | 'en', title: string): Promise<void> {
  await run('qpdf', ['--deterministic-id', '--object-streams=generate', '--stream-data=compress', inputPath, outputPath]);
  const bytes = await fs.readFile(outputPath);
  if (!bytes.length) throw new Error(`Canonical PDF post-process produced empty ${language} output for ${title}`);
}
function parseInfo(info: string): { pages: number; width: number; height: number } {
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  const size = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  if (!Number.isInteger(pages) || pages < 1 || !size) throw new Error('Exact PDF QA could not parse page count/size');
  return { pages, width: Number(size[1]), height: Number(size[2]) };
}
async function listPngs(dir: string, prefix: string): Promise<string[]> {
  return (await fs.readdir(dir)).filter((name) => name.startsWith(prefix) && name.endsWith('.png')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map((name)=>path.join(dir,name));
}
export async function runExactPdfQa(input: { pdfPath: string; workDir: string; expectedPageCount: number }): Promise<ExactPdfQaResult> {
  await fs.mkdir(input.workDir, { recursive: true });
  const toolVersions = await preflightPdfQualityToolchain();
  await run('qpdf', ['--check', input.pdfPath]);
  const info = parseInfo(await run('pdfinfo', [input.pdfPath]));
  if (info.pages !== input.expectedPageCount) throw new Error(`PDF page-count drift: expected ${input.expectedPageCount}, got ${info.pages}`);
  const textPath = path.join(input.workDir, 'extracted.txt');
  await run('pdftotext', ['-layout', input.pdfPath, textPath]);
  const text = await fs.readFile(textPath);
  if (!text.toString('utf8').trim()) throw new Error('PDF text layer is empty');
  const fonts = await run('pdffonts', [input.pdfPath]);
  const fontRows = fonts.split('\n').slice(2).filter(Boolean);
  if (fontRows.some((row) => !/\byes\b/i.test(row))) throw new Error('PDF QA found a non-embedded font');
  const popplerPrefix = path.join(input.workDir, 'poppler');
  await run('pdftoppm', ['-png', '-r', '300', input.pdfPath, popplerPrefix]);
  const mupdfPrefix = path.join(input.workDir, 'mupdf-%d.png');
  await run('mutool', ['draw', '-q', '-r', '300', '-o', mupdfPrefix, input.pdfPath]);
  const popplerPages = await listPngs(input.workDir, 'poppler-');
  const mupdfPages = await listPngs(input.workDir, 'mupdf-');
  if (popplerPages.length !== info.pages || mupdfPages.length !== info.pages) throw new Error('PDF QA did not rasterize every page with both engines');
  const detailTiles: string[][] = [];
  for (let i=0;i<info.pages;i++) {
    const tiles: string[] = [];
    for (const source of [popplerPages[i]!, mupdfPages[i]!]) {
      const target = path.join(input.workDir, `detail-${i+1}-${tiles.length+1}.png`);
      await fs.copyFile(source, target); tiles.push(target);
    }
    detailTiles.push(tiles);
  }
  const pdf = await fs.readFile(input.pdfPath);
  const pdfDigest = bytesDigest(pdf), extractedTextDigest = bytesDigest(text);
  const gateDigest = reportQualityDigest({ pdfDigest, extractedTextDigest, pageCount: info.pages, pageWidthPt: info.width, pageHeightPt: info.height, toolVersions });
  return { pdfDigest, pageCount: info.pages, pageWidthPt: info.width, pageHeightPt: info.height, extractedTextDigest, gateDigest, coverage: { popplerPages: popplerPages.length, mupdfPages: mupdfPages.length, detailTiles: detailTiles.flat().length }, toolVersions, popplerPages, mupdfPages, detailTiles };
}
