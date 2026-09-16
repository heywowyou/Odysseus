/**
 * Prospect CLI surface: a terminal/cron convenience for the one operation
 * that does not run from the dashboard, importing the hotel directory the
 * prospect hub adds from.
 *
 * The commander wiring here is a thin layer: the one registered
 * subcommand, `directory-import`, lives in `prospect/ingest.ts`, mirroring
 * how `audit.ts` and `scan.ts` stay small. The prescan, scoring, contact,
 * preview, and draft command groups were removed with plan 047; those flows
 * now run from the prospect hub in the dashboard. Real logic lives in
 * `@odysseus/interface` and `@odysseus/store`.
 */

import type { Command } from 'commander';
import { registerIngestCommands } from './prospect/ingest.js';

export function registerProspectCommand(program: Command): void {
  const prospect = program
    .command('prospect')
    .description('Prospect directory maintenance: import the Atout France hotel catalogue.');

  registerIngestCommands(prospect);
}
