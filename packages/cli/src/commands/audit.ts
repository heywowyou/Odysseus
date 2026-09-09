import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import { runAuditStage } from '@odysseus/interface';
import {
  isHttpUrlWithoutCredentials,
  type AuditCoverageSummary,
  type SiteSignalOverrides,
} from '@odysseus/core';
import { deleteCrawlCheckpoint, deleteCrawlStateFile } from '@odysseus/scanner';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';
import { parseSirenOption } from '../parse-siren-option.js';
import { parseBooleanOption } from '../parse-boolean-option.js';

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

const COVERAGE_REASON_LABELS: Readonly<Record<string, string>> = {
  'discovered-not-scanned': 'discovered but deliberately not scanned',
  'skipped-robots': 'skipped robots',
  'skipped-non-html': 'skipped non-HTML',
  'skipped-external-redirect': 'skipped external redirect',
  error: 'crawl error',
  'coverage-missing': 'coverage missing',
};

export function formatAuditCoverageSummary(summary: AuditCoverageSummary): string[] {
  const lines = [`  URLs inventoried: ${summary.inventoriedUrlCount}`];
  if (summary.kind === 'legacy-unknown') {
    lines.push('  Pass-specific coverage: unknown (legacy manifest)');
  } else {
    lines.push(
      `  Content checks: ${summary.content.completed} completed, ${summary.content.partial} partial, ${summary.content.failed} failed`,
      `  Axe: ${summary.passes.axe.completed} completed, ${summary.passes.axe.failed} failed`,
      `  Lighthouse: ${summary.passes.lighthouse.completed} measured, ${summary.passes.lighthouse.failed} failed, ${summary.passes.lighthouse.notPlanned} not planned`,
    );
    const withoutContentEntries = Object.entries(summary.pagesWithoutContentAnalysis).filter(
      (entry): entry is [string, number] => entry[1] !== undefined && entry[1] > 0,
    );
    if (withoutContentEntries.length > 0) {
      const total = withoutContentEntries.reduce((sum, [, count]) => sum + count, 0);
      const reasons = withoutContentEntries
        .map(([reason, count]) => `${COVERAGE_REASON_LABELS[reason] ?? reason}: ${count}`)
        .join(', ');
      lines.push(`  Pages without content analysis: ${total} (${reasons})`);
    }
    lines.push(`  Template families represented: ${summary.templateFamilyCount}`);
  }
  lines.push(`  Continuation URLs omitted: ${summary.continuationOmittedUrlCount}`);
  return lines;
}

export function registerAuditCommand(program: Command): void {
  program
    .command('audit <url>')
    .description(
      'Crawl a site, run all scanners, normalize into findings, and persist to MongoDB. ' +
        'Prints a summary and the auditId.',
    )
    .option('--max-pages <n>', 'Maximum number of pages to visit', parsePositiveInt)
    .option('--max-depth <n>', 'Maximum link depth from the homepage', parsePositiveInt)
    .option(
      '--crawl-delay-ms <n>',
      "Minimum pause in milliseconds between this audit's requests to the site (issue #111: the " +
        'coverage gate\'s "slow the crawl" remedy for one site). Values below the configured ' +
        "default are raised to it, and robots.txt's own crawl-delay still applies as a floor, " +
        'so this can only slow the crawl down.',
      parsePositiveInt,
    )
    .option(
      '--scan-concurrency <n>',
      'Maximum number of pages scanned at once for this audit. Values above the configured ' +
        'default are lowered to it, so this can only reduce the load on the site.',
      parsePositiveInt,
    )
    .option(
      '--siren <number>',
      'Manually supplied SIREN, used for the obligation determination when the site itself does ' +
        'not publish one (or to cross-check one that does). Never suppresses the LCEN finding.',
      parseSirenOption,
    )
    .option(
      '--override-transactional-flow <true|false>',
      'Manually asserted fact about whether this site takes bookings or sells online for its own ' +
        'account, used when the automated detector may miss the pattern (phone-only booking, ' +
        'messaging flows, and similar). Wins over the detector when both are present; the ' +
        'disagreement is logged, never silently dropped.',
      parseBooleanOption,
    )
    .option(
      '--override-transactional-flow-reason <text>',
      'Optional free-text reason for --override-transactional-flow, carried into the report.',
    )
    .action(
      async (
        url: string,
        opts: {
          maxPages?: number;
          maxDepth?: number;
          crawlDelayMs?: number;
          scanConcurrency?: number;
          siren?: string;
          overrideTransactionalFlow?: boolean;
          overrideTransactionalFlowReason?: string;
        },
      ) => {
        if (!isHttpUrlWithoutCredentials(url)) {
          console.error(
            `odysseus audit: "${url}" must be an absolute http(s) URL without embedded credentials`,
          );
          process.exitCode = 1;
          return;
        }

        const siteSignalOverrides: SiteSignalOverrides | undefined =
          opts.overrideTransactionalFlow !== undefined
            ? {
                hasTransactionalFlow: {
                  value: opts.overrideTransactionalFlow,
                  ...(opts.overrideTransactionalFlowReason !== undefined
                    ? { reason: opts.overrideTransactionalFlowReason }
                    : {}),
                },
              }
            : undefined;

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

        try {
          mongoConnection = await connectToMongo();
          const result = await runAuditStage(
            url,
            {
              ...(opts.maxPages !== undefined ? { maxPages: opts.maxPages } : {}),
              ...(opts.maxDepth !== undefined ? { maxDepth: opts.maxDepth } : {}),
              ...(opts.crawlDelayMs !== undefined ? { delayMs: opts.crawlDelayMs } : {}),
              ...(opts.scanConcurrency !== undefined
                ? { scanConcurrency: opts.scanConcurrency }
                : {}),
              ...(opts.siren !== undefined ? { manualSiren: opts.siren } : {}),
              ...(siteSignalOverrides !== undefined ? { siteSignalOverrides } : {}),
            },
            mongoConnection,
          );

          // Plan 002 (issue #132): the audit stage keeps the crawl
          // checkpoint on disk so a crash before this point can resume
          // without re-crawling. This command is the whole pipeline for a
          // manual run (audit stage only, nothing after it), so a completed
          // run is the terminal point where the checkpoint can go.
          deleteCrawlCheckpoint(result.auditDir);
          deleteCrawlStateFile(result.auditDir);

          const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
          for (const finding of result.findings) bySeverity[finding.severity]++;

          console.log(`Audit ${result.auditId} complete for ${url}`);
          for (const line of formatAuditCoverageSummary(result.coverageSummary)) {
            console.log(line);
          }
          console.log(
            `  Findings: ${result.findings.length} (critical: ${bySeverity.critical}, serious: ${bySeverity.serious}, moderate: ${bySeverity.moderate}, minor: ${bySeverity.minor})`,
          );
          console.log(`  Screenshots pruned: ${result.prunedPageDirCount}`);
          console.log(`  Artifacts: ${result.auditDir}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus audit: failed to audit ${url}\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );
}
