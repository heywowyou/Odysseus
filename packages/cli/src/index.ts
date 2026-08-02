#!/usr/bin/env node
/**
 * Odysseus CLI entry point.
 *
 * Scaffold only: no scanner, crawler, or audit command is wired up yet.
 * Build order milestone 1 (render diff, CLI invocable) adds the first
 * real command on top of this.
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('odysseus')
  .description('Deterministic web audit engine for technical/SPA-SEO and accessibility audits')
  .version('0.1.0');

program.parse(process.argv);
