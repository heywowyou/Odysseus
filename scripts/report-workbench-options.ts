import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Browser } from 'playwright';
import { launchBrowser } from '../packages/scanner/src/index.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../packages/report/src/constants.js';
import { renderPdfWithPageCountFromHtml } from '../packages/report/src/pdf.js';

// Renders every candidate option's complete document concurrently, then
// rasterizes only the requested physical page from each rendered PDF. This
// implements report-workbench.md step 6 (build N genuinely different
// options, render each complete document, rasterize the affected page) as a
// bounded-concurrency batch instead of one renderPdfWithPageCountFromHtml
// call at a time, since the options are independent of each other.

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function optionList(name: string): string[] {
  const values: string[] = [];
  for (let index = args.indexOf(name); index !== -1; index = args.indexOf(name, index + 1)) {
    const value = args[index + 1];
    if (value !== undefined) values.push(value);
  }
  return values;
}

const htmlPaths = optionList('--html');
if (htmlPaths.length === 0) throw new Error('Pass at least one --html <path> per option');

const pageArg = option('--page');
if (pageArg === undefined) throw new Error('Pass --page <physical page number>');
const pageNumber = Number(pageArg);
if (!Number.isInteger(pageNumber) || pageNumber < 1) {
  throw new Error(`Invalid --page value: ${pageArg}`);
}

const outDir = resolve(option('--out') ?? 'artifacts/report-variants');
const prefix = option('--prefix') ?? 'option';
const concurrencyArg = option('--concurrency');
const concurrency = concurrencyArg === undefined ? 4 : Number(concurrencyArg);
if (!Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error(`Invalid --concurrency value: ${concurrencyArg}`);
}

await mkdir(outDir, { recursive: true });

interface OptionResult {
  index: number;
  htmlPath: string;
  pdfPath: string;
  pagePngPath: string;
  pageCount: number;
}

async function renderOption(
  index: number,
  htmlPath: string,
  browser: Browser,
): Promise<OptionResult> {
  const html = await readFile(resolve(htmlPath), 'utf8');
  const rendered = await renderPdfWithPageCountFromHtml(html, browser);
  const pdfPath = join(outDir, `${prefix}-${index}.pdf`);
  await writeFile(pdfPath, rendered.pdf);

  if (pageNumber > rendered.pageCount) {
    throw new Error(
      `Option ${index} (${htmlPath}) only has ${rendered.pageCount} page(s); ` +
        `cannot rasterize page ${pageNumber}`,
    );
  }

  const pagePngPath = join(outDir, `page-${String(pageNumber).padStart(2, '0')}-v${index}`);
  await execFileAsync(
    'pdftoppm',
    [
      '-png',
      '-r',
      '144',
      '-f',
      String(pageNumber),
      '-l',
      String(pageNumber),
      '-singlefile',
      pdfPath,
      pagePngPath,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );

  return {
    index,
    htmlPath,
    pdfPath,
    pagePngPath: `${pagePngPath}.png`,
    pageCount: rendered.pageCount,
  };
}

async function runWithConcurrency<T>(
  items: readonly (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await items[currentIndex]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
try {
  const tasks = htmlPaths.map(
    (htmlPath, position) => () => renderOption(position + 1, htmlPath, browser),
  );
  const results = await runWithConcurrency(tasks, concurrency);
  for (const result of results) {
    process.stdout.write(
      `Option ${result.index}: ${result.pageCount} page(s), page ${pageNumber} -> ${result.pagePngPath}\n`,
    );
  }
} finally {
  await browser.close();
}
