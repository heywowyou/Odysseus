import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import {
  buildAuditDir,
  getArtifactsRoot,
  launchBrowser,
  PUBLIC_SITE_NETWORK_POLICY,
  scanSite,
} from '@odysseus/scanner';
import { isHttpUrlWithoutCredentials } from '@odysseus/core';
import { parseSirenOption } from '../parse-siren-option.js';
import { parseBooleanOption } from '../parse-boolean-option.js';

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

export function registerScanCommand(program: Command): void {
  program
    .command('scan <url>')
    .description(
      'Crawl a site and run axe-core (WCAG 2.2 AA) and Lighthouse against every page visited, ' +
        'reusing one Chromium instance. Outputs raw per-page scanner results, not normalized findings.',
    )
    .option('--max-pages <n>', 'Maximum number of pages to visit', parsePositiveInt)
    .option('--max-depth <n>', 'Maximum link depth from the homepage', parsePositiveInt)
    .option(
      '--siren <number>',
      'Manually supplied SIREN. Validated here for consistency with `audit`, but this command has ' +
        'no obligation-determination stage of its own to feed - it is accepted and checked, not used.',
      parseSirenOption,
    )
    .option(
      '--override-transactional-flow <true|false>',
      'Manual hasTransactionalFlow override. Validated here for consistency with `audit`, same ' +
        '"accepted and checked, not used" posture as --siren above.',
      parseBooleanOption,
    )
    .option(
      '--override-transactional-flow-reason <text>',
      'Optional free-text reason for --override-transactional-flow. Accepted and checked, not used.',
    )
    .action(
      async (
        url: string,
        opts: {
          maxPages?: number;
          maxDepth?: number;
          siren?: string;
          overrideTransactionalFlow?: boolean;
          overrideTransactionalFlowReason?: string;
        },
      ) => {
        if (!isHttpUrlWithoutCredentials(url)) {
          console.error(
            `odysseus scan: "${url}" must be an absolute http(s) URL without embedded credentials`,
          );
          process.exitCode = 1;
          return;
        }

        // Issue #488: the operator's machine gets the same private-address
        // guard as a queued audit, for the browser and every side fetch.
        const networkPolicy = PUBLIC_SITE_NETWORK_POLICY;
        const { browser, debugPort } = await launchBrowser({ networkPolicy });
        try {
          const hostname = new URL(url).hostname;
          const screenshotDir = path.join(
            buildAuditDir(getArtifactsRoot(), hostname, new Date()),
            'pages',
          );

          const result = await scanSite(url, {
            browser,
            debugPort,
            screenshotDir,
            networkPolicy,
            ...(opts.maxPages !== undefined ? { maxPages: opts.maxPages } : {}),
            ...(opts.maxDepth !== undefined ? { maxDepth: opts.maxDepth } : {}),
          });
          console.log(JSON.stringify(result, null, 2));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus scan: failed to scan ${url}\n${message}`);
          process.exitCode = 1;
        } finally {
          await browser.close();
        }
      },
    );
}
