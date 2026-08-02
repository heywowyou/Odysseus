#!/usr/bin/env node
/**
 * Odysseus CLI entry point.
 */

import { Command } from 'commander';
import { registerRenderDiffCommand } from './commands/render-diff.js';
import { registerCrawlCommand } from './commands/crawl.js';
import { registerScanCommand } from './commands/scan.js';
import { registerAuditCommand } from './commands/audit.js';
import { registerNormalizeCommand } from './commands/normalize.js';
import { registerAnalyzeCommand } from './commands/analyze.js';

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

program.parse(process.argv);
