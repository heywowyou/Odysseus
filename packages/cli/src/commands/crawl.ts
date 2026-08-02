import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import { crawlSite, launchBrowser } from '@odysseus/scanner';

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

export function registerCrawlCommand(program: Command): void {
  program
    .command('crawl <url>')
    .description(
      'Crawl a site from its homepage, following internal links and respecting robots.txt.',
    )
    .option('--max-pages <n>', 'Maximum number of pages to visit', parsePositiveInt)
    .option('--max-depth <n>', 'Maximum link depth from the homepage', parsePositiveInt)
    .action(async (url: string, opts: { maxPages?: number; maxDepth?: number }) => {
      try {
        new URL(url);
      } catch {
        console.error(`odysseus crawl: "${url}" is not a valid URL`);
        process.exitCode = 1;
        return;
      }

      const browser = await launchBrowser();
      try {
        const result = await crawlSite(url, {
          browser,
          ...(opts.maxPages !== undefined ? { maxPages: opts.maxPages } : {}),
          ...(opts.maxDepth !== undefined ? { maxDepth: opts.maxDepth } : {}),
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus crawl: failed to crawl ${url}\n${message}`);
        process.exitCode = 1;
      } finally {
        await browser.close();
      }
    });
}
