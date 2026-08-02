#!/usr/bin/env node
/**
 * Odysseus CLI entry point.
 */

import { Command } from 'commander';
import { registerRenderDiffCommand } from './commands/render-diff.js';

const program = new Command();

program
  .name('odysseus')
  .description('Deterministic web audit engine for technical/SPA-SEO and accessibility audits')
  .version('0.1.0');

registerRenderDiffCommand(program);

program.parse(process.argv);
