import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import { runAuditStage } from '@odysseus/interface';
import { isHttpUrlWithoutCredentials, type SiteSignalOverrides } from '@odysseus/core';
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
              ...(opts.siren !== undefined ? { manualSiren: opts.siren } : {}),
              ...(siteSignalOverrides !== undefined ? { siteSignalOverrides } : {}),
            },
            mongoConnection,
          );

          const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
          for (const finding of result.findings) bySeverity[finding.severity]++;

          console.log(`Audit ${result.auditId} complete for ${url}`);
          console.log(`  Pages visited: ${result.visitedCount}`);
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
