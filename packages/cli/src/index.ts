#!/usr/bin/env node
/**
 * Odysseus CLI entry point.
 */

import { Command } from 'commander';
import { ensureEnvLoaded } from '@odysseus/scanner';
import { registerRenderDiffCommand } from './commands/render-diff.js';
import { registerCrawlCommand } from './commands/crawl.js';
import { registerScanCommand } from './commands/scan.js';
import { registerAuditCommand } from './commands/audit.js';
import { registerNormalizeCommand } from './commands/normalize.js';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerBackfillAuditCommand } from './commands/backfill-audit.js';
import { registerReportCommand } from './commands/report.js';
import { registerServeCommand } from './commands/serve.js';
import { registerProspectCommand } from './commands/prospect.js';
import { registerBenchmarkCommand } from './commands/benchmark.js';
import { registerVerifyReportsCommand } from './commands/verify-reports.js';
import { registerArtifactsCommand } from './commands/artifacts.js';

// Loaded once, unconditionally, here rather than left as a side effect of
// whichever command happens to import @odysseus/scanner or @odysseus/llm
// first, so every command can read .env values regardless of which
// packages it imports.
ensureEnvLoaded();

const program = new Command();

program
  .name('odysseus')
  .description('Deterministic web audit engine for technical/SPA-SEO and accessibility audits')
  .version('0.1.0');

registerRenderDiffCommand(program);
registerCrawlCommand(program);
registerScanCommand(program);
registerAuditCommand(program);
registerNormalizeCommand(program);
registerAnalyzeCommand(program);
registerBackfillAuditCommand(program);
registerReportCommand(program);
registerServeCommand(program);
registerProspectCommand(program);
registerBenchmarkCommand(program);
registerVerifyReportsCommand(program);
registerArtifactsCommand(program);

program.parse(process.argv);
