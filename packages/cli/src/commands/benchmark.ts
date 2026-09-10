/**
 * Milestone 10 CLI surface: the benchmark study's own command group,
 * separate from `prospect` because this cohort is never contacted and
 * never fed into the prospecting funnel - see
 * docs/product/milestone-10-benchmark-permission-record.md.
 */

import type { Command } from 'commander';
import { registerBenchmarkQualifyCommand } from './benchmark/qualify.js';

export function registerBenchmarkCommand(program: Command): void {
  const benchmark = program
    .command('benchmark')
    .description(
      'Milestone 10 published accessibility benchmark: a fixed, non-contacted cohort of major ' +
        'French e-commerce sites, scanned once for an aggregate, never-individually-named ' +
        'statistic.',
    );

  registerBenchmarkQualifyCommand(benchmark);
}
