import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, extname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { launchBrowser } from '../packages/scanner/src/index.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../packages/report/src/constants.js';
import { renderPdfWithPageCountFromHtml } from '../packages/report/src/pdf.js';
import { buildStressFixture } from '../packages/report/src/stress-fixture.js';
import { renderHtml } from '../packages/report/src/template/render-html.js';
import { renderReportWorkbenchHtml } from '../packages/report/src/workbench.js';

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function positivePort(value: string | undefined): number {
  if (value === undefined) return 4173;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65_535) {
    throw new Error(`Invalid --port value: ${value}`);
  }
  return parsed;
}

const port = positivePort(option('--port'));
const outputDir = resolve(option('--output') ?? 'artifacts/report-workbench');
const pagesDir = join(outputDir, 'pages');
const sourcePdf = option('--pdf');
const reportPdf = join(outputDir, 'report.pdf');

await mkdir(outputDir, { recursive: true });
await rm(pagesDir, { recursive: true, force: true });
await mkdir(pagesDir, { recursive: true });

let title: string;
if (sourcePdf !== undefined) {
  const resolvedPdf = resolve(sourcePdf);
  if (extname(resolvedPdf).toLowerCase() !== '.pdf') {
    throw new Error('--pdf must point to a PDF file');
  }
  await copyFile(resolvedPdf, reportPdf);
  title = basename(resolvedPdf, extname(resolvedPdf));
} else {
  const fixture = buildStressFixture();
  const html = await renderHtml({ ...fixture, renderDiffEvidencePages: [] });
  const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
  try {
    const rendered = await renderPdfWithPageCountFromHtml(html, browser);
    await writeFile(reportPdf, rendered.pdf);
  } finally {
    await browser.close();
  }
  title = 'Rapport de référence · Fixture de stress';
}

await execFileAsync('pdftoppm', ['-png', '-r', '144', reportPdf, join(pagesDir, 'page')], {
  maxBuffer: 16 * 1024 * 1024,
});

const pageFiles = (await readdir(pagesDir))
  .filter((fileName) => /^page-\d+\.png$/u.test(fileName))
  .sort((left, right) => {
    const leftNumber = Number(/\d+/u.exec(left)?.[0] ?? 0);
    const rightNumber = Number(/\d+/u.exec(right)?.[0] ?? 0);
    return leftNumber - rightNumber;
  });

if (pageFiles.length === 0) throw new Error('pdftoppm produced no page images');

const workbenchHtml = renderReportWorkbenchHtml({
  title,
  pdfPath: './report.pdf',
  pages: pageFiles.map((fileName, index) => ({
    number: index + 1,
    imagePath: `./pages/${fileName}`,
  })),
});
await writeFile(join(outputDir, 'index.html'), workbenchHtml);

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    const relativePath = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.slice(1);
    const filePath = resolve(outputDir, relativePath);
    if (filePath !== outputDir && !filePath.startsWith(`${outputDir}${sep}`)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Report workbench: http://localhost:${port}/\n`);
  process.stdout.write(`PDF: http://localhost:${port}/report.pdf\n`);
  process.stdout.write(`Source: ${reportPdf}\n`);
});
