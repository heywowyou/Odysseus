/**
 * Milestone 10 CLI surface: the benchmark study's own command group,
 * separate from `prospect` because this cohort is never contacted and
 * never fed into the prospecting funnel - see
 * docs/product/milestone-10-benchmark-permission-record.md.
 */

import type { Command } from 'commander';
import { registerBenchmarkQualifyCommand } from './benchmark/qualify.js';
import { registerBenchmarkReportQualityCommand } from './benchmark/report-quality.js';

export function registerBenchmarkCommand(program: Command): void {
  const benchmark = program
    .command('benchmark')
    .description(
      'Milestone 10 published accessibility benchmark: a fixed, non-contacted cohort of major ' +
        'French e-commerce sites, scanned once for an aggregate, never-individually-named ' +
        'statistic.',
    );

  registerBenchmarkQualifyCommand(benchmark);
  // Plan 058: the saved-corpus benchmark for the report-quality pipeline.
  // A different kind of benchmark from the cohort above - it makes real
  // model calls over already-saved audits and never contacts any site.
  registerBenchmarkReportQualityCommand(benchmark);
}
