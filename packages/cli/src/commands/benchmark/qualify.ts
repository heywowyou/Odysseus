/**
 * Milestone 10 stage 1: plain-HTTP qualification of the frozen benchmark
 * cohort (docs/product/milestone-10-benchmark-permission-record.md).
 * Mirrors packages/cli/src/commands/prospect/hotel-qualify.ts's `run`
 * shape (inline, connects to Mongo even for dry-run, dry-run reports a
 * plan rather than deciding anything, progress to stderr, one parseable
 * JSON document to stdout) applied to the milestone 9a plain-HTTP
 * qualification building blocks instead of the hotel-specific ones.
 *
 * No `--resume` flag: every invocation queries for candidates still
 * `pending` and only fetches those, so re-running after an interruption
 * already resumes for free, per binding decision 18.
 *
 * `--retry-failed` is a deliberate, separate mode: 'fetch-failed' is a
 * terminal status a normal run never revisits, so classifying an already-
 * failed batch (distinguishing a robots-declined site from a genuinely
 * unreachable one) needs an explicit opt-in, one more request to sites
 * whose first attempt returned no usable content - still within the
 * permission record's "at most two requests per site" per attempt.
 */

import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  seedBenchmarkCandidates,
  listBenchmarkCandidates,
  listPendingBenchmarkCandidates,
  listFetchFailedBenchmarkCandidates,
  recordBenchmarkCandidateOutcome,
  getBenchmarkQualificationSummary,
  isSuppressed,
  type BenchmarkCandidateDocument,
} from '@odysseus/store';
import {
  OriginLock,
  getCrawlDelayMs,
  getCrawlerUserAgent,
  extractMentionsLegales,
} from '@odysseus/scanner';
import {
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  fetchMentionsLegalesData,
  getOrBuildSireneStockIndex,
  getSireneStockPath,
  getBenchmarkSireneStockIndexCachePath,
  toLanes,
} from '@odysseus/interface';
import { qualifyBenchmarkCandidate } from '@odysseus/core';
import { BENCHMARK_COHORT_VERSION, BENCHMARK_COHORT_DOMAINS } from './cohort.js';

/** The sector-set extension the permission record's decision 2 (option B)
 *  approves for this cohort's qualification only: every retail division-47
 *  NAF class, not the outreach allowlist's narrower 47.91A/B. A prefix
 *  test rather than a hand-enumerated code list, so no division-47
 *  subclass is silently missed. */
const DIVISION_47_PREFIX = '47.';

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

function hostnameOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function registerBenchmarkQualifyCommand(benchmark: Command): void {
  const qualify = benchmark
    .command('qualify')
    .description(
      'Plain-HTTP qualification of the frozen benchmark cohort: homepage and mentions-legales ' +
        'only, at most two requests per site, no browser, no contact discovery. Runs inline.',
    );

  qualify
    .command('run')
    .description('Fetch, extract, and qualify every not-yet-decided candidate.')
    .option('--concurrency <n>', 'Candidates in flight at once', parsePositiveInt, 3)
    .option(
      '--dry-run',
      'Seed the candidate list and report what would be fetched, contacting nobody and ' +
        'writing no outcome',
      false,
    )
    .option(
      '--retry-failed',
      'Re-fetch only the candidates currently marked fetch-failed, to classify why (robots ' +
        'decline vs. genuinely unreachable), instead of the normal pending list',
      false,
    )
    .action(async (opts: { concurrency: number; dryRun: boolean; retryFailed: boolean }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const connection = mongoConnection;

        // Persisted before the first request, on every invocation including a
        // resumed one - already-decided candidates are left untouched.
        await seedBenchmarkCandidates(
          connection,
          BENCHMARK_COHORT_VERSION,
          BENCHMARK_COHORT_DOMAINS.map((domain, index) => ({ rank: index + 1, domain })),
        );

        const selectCandidates = (): Promise<BenchmarkCandidateDocument[]> =>
          opts.retryFailed
            ? listFetchFailedBenchmarkCandidates(connection, BENCHMARK_COHORT_VERSION)
            : listPendingBenchmarkCandidates(connection, BENCHMARK_COHORT_VERSION);

        if (opts.dryRun) {
          const [all, toFetch] = await Promise.all([
            listBenchmarkCandidates(connection, BENCHMARK_COHORT_VERSION),
            selectCandidates(),
          ]);
          console.log(
            JSON.stringify(
              {
                cohortVersion: BENCHMARK_COHORT_VERSION,
                cohortSize: all.length,
                mode: opts.retryFailed ? 'retry-failed' : 'pending',
                wouldFetchCount: toFetch.length,
                wouldFetch: toFetch.map((candidate) => candidate.domain),
              },
              null,
              2,
            ),
          );
          return;
        }

        // One lock for the whole run: politeness is per-origin, not per-lane.
        const originLock = new OriginLock();
        const fetchOptions = {
          crawlDelayMs: getCrawlDelayMs(),
          userAgent: getCrawlerUserAgent(),
          timeoutMs: DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
        };

        // A separate cache path and a separate NAF filter from the outreach
        // index - never the shared cache, and never the shared allowlist.
        const sireneIndex = await getOrBuildSireneStockIndex(
          getSireneStockPath(),
          getBenchmarkSireneStockIndexCachePath(),
          (naf) => naf.startsWith(DIVISION_47_PREFIX),
        );

        const toProcess = await selectCandidates();
        let evaluated = 0;

        await Promise.all(
          toLanes(toProcess, opts.concurrency).map(async (lane) => {
            for (const candidate of lane) {
              const siteUrl = `https://${candidate.domain}/`;
              const fetchResult = await fetchMentionsLegalesData(siteUrl, originLock, fetchOptions);
              const resolvedHost = hostnameOf(fetchResult.resolvedHomepageUrl);

              const text = fetchResult.mentionsLegalesText ?? fetchResult.homepageText;
              if (text === null) {
                await recordBenchmarkCandidateOutcome(
                  connection,
                  BENCHMARK_COHORT_VERSION,
                  candidate.domain,
                  {
                    resolvedHost,
                    status: 'fetch-failed',
                    reasons: [],
                    fetchFailureReason: fetchResult.failureReason,
                    siren: null,
                    denomination: null,
                    naf: null,
                  },
                );
                evaluated += 1;
                process.stderr.write(
                  `qualified ${String(evaluated)}/${String(toProcess.length)} candidates\n`,
                );
                continue;
              }

              const extraction = extractMentionsLegales(
                fetchResult.mentionsLegalesUrl ?? siteUrl,
                text,
              );
              const siren = extraction.siren ?? null;
              const sireneMatch = siren !== null ? sireneIndex.lookup(siren) : null;
              const domainSuppressed = await isSuppressed(connection, candidate.domain);

              const result = qualifyBenchmarkCandidate({ sireneMatch, siren, domainSuppressed });

              await recordBenchmarkCandidateOutcome(
                connection,
                BENCHMARK_COHORT_VERSION,
                candidate.domain,
                {
                  resolvedHost,
                  status: result.qualified ? 'qualified' : 'disqualified',
                  reasons: result.reasons,
                  fetchFailureReason: null,
                  siren,
                  denomination: sireneMatch?.denomination ?? null,
                  naf: sireneMatch?.naf ?? null,
                },
              );

              evaluated += 1;
              process.stderr.write(
                `qualified ${String(evaluated)}/${String(toProcess.length)} candidates\n`,
              );
            }
          }),
        );

        const summary = await getBenchmarkQualificationSummary(
          connection,
          BENCHMARK_COHORT_VERSION,
        );
        console.log(JSON.stringify(summary, null, 2));

        // The design's minimum benchmark cohort floor - printed, not acted
        // on: falling short is an operator decision (activate a reserve),
        // never something this command resolves on its own.
        if (summary.byStatus.pending === 0 && summary.byStatus.qualified < 20) {
          console.error(
            `odysseus benchmark qualify run: only ${String(summary.byStatus.qualified)} of ` +
              `${String(summary.total)} candidates qualified, below the 20-site floor. See ` +
              'docs/research/milestone-10-benchmark-cohort.md section 7 for the sanctioned reserves.',
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus benchmark qualify run: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
