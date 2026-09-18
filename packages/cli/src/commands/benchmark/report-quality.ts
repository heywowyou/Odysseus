/**
 * Plan 058 saved-corpus benchmark: run the report-quality pipeline over a
 * corpus of already-saved audits and record machine-readable outcomes. This
 * is the live-model counterpart to the pure offline analysis commands - it
 * makes real model calls, one corpus run per invocation, and writes outcome
 * digests/counts (never report prose or PDF bytes) under the output
 * directory.
 *
 * Mirrors benchmark/qualify.ts's `run` shape: inline execution, progress to
 * stderr, one parseable JSON document to stdout. Two deliberate deltas from
 * that shape: `--dry-run` connects to no database at all (the dry run reads
 * saved artifacts and validates evidence only - there is nothing to seed or
 * decide in Mongo), and the non-dry run fails fast when the private
 * artifact store is not configured, because the pipeline itself refuses to
 * run without one and failing after the first model call is the expensive
 * way to learn it.
 */

import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';
import {
  createConfiguredArtifactStore,
  dryRunReportQualityCorpus,
  loadCorpusManifest,
  LocalDirArtifactStore,
  runReportQualityCorpus,
  type ReportQualityCorpusManifest,
} from '@odysseus/interface';
import { getArtifactsRoot } from '@odysseus/scanner';

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

function defaultOutDir(corpusId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  return path.join(getArtifactsRoot(), 'report-quality-benchmark', corpusId, stamp);
}

export function registerBenchmarkReportQualityCommand(benchmark: Command): void {
  const reportQuality = benchmark
    .command('report-quality')
    .description(
      'Plan 058 saved-corpus benchmark for the report-quality pipeline: runs the full ' +
        'bilingual quality pipeline over saved audits from a corpus manifest and records ' +
        'machine-readable outcomes. Makes real model calls; never contacts the audited sites.',
    );

  reportQuality
    .command('run')
    .description('Run the pipeline over every corpus entry and write outcome files.')
    .requiredOption('--manifest <path>', 'Path to the corpus manifest JSON')
    .option(
      '--dry-run',
      'Validate every entry (saved audit shape + evidence load) and print the per-entry ' +
        'plan without calling any model, writing any outcome, or connecting to Mongo',
      false,
    )
    .option('--concurrency <n>', 'Corpus entries in flight at once', parsePositiveInt, 1)
    .option(
      '--out <dir>',
      'Directory for outcome files and summary.json (default: a timestamped directory ' +
        'under the artifacts root, which is gitignored)',
    )
    .option(
      '--store-dir <path>',
      'Root of a local-directory artifact store, instead of the configured private bucket ' +
        '(for local corpus runs on this machine)',
    )
    .action(
      async (opts: {
        manifest: string;
        dryRun: boolean;
        concurrency: number;
        out?: string;
        storeDir?: string;
      }) => {
        try {
          const corpus: ReportQualityCorpusManifest = await loadCorpusManifest(opts.manifest);

          if (opts.dryRun) {
            const plan = await dryRunReportQualityCorpus(corpus);
            const invalid = plan.entries.filter((entry) => entry.status === 'invalid').length;
            process.stderr.write(
              `dry run: ${String(plan.entries.length - invalid)}/${String(plan.entries.length)} ` +
                'entries ready\n',
            );
            console.log(JSON.stringify(plan, null, 2));
            if (invalid > 0) process.exitCode = 1;
            return;
          }

          const artifactStore = opts.storeDir
            ? new LocalDirArtifactStore(path.resolve(opts.storeDir))
            : createConfiguredArtifactStore();
          if (!artifactStore) {
            throw new Error(
              'report-quality corpus runs require the configured private artifact store ' +
                '(ODYSSEUS_ARTIFACTS_BUCKET_*), or pass --store-dir for a local-directory ' +
                'store; the pipeline refuses local-disk-only candidates',
            );
          }

          const outDir = opts.out ?? defaultOutDir(corpus.corpusId);
          const connection = await connectToMongo();
          try {
            const { summary } = await runReportQualityCorpus(corpus, {
              connection,
              artifactStore,
              concurrency: opts.concurrency,
              outDir,
              onProgress: (progress) => {
                process.stderr.write(
                  `[${String(progress.completed)}/${String(progress.total)}] ` +
                    `${progress.entryId} -> ${progress.state} (${String(progress.durationMs)}ms)\n`,
                );
              },
            });
            process.stderr.write(`outcomes written under ${outDir}\n`);
            console.log(JSON.stringify({ outDir, summary }, null, 2));
          } finally {
            await disconnectFromMongo(connection);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus benchmark report-quality run: failed\n${message}`);
          process.exitCode = 1;
        }
      },
    );
}
