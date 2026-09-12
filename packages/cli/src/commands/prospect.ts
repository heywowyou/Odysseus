/**
 * Milestone 9a CLI surface: a convenience for enqueuing an ingestion
 * batch from a terminal/cron rather than the dashboard route
 * (registerProspectingRoutes, packages/interface), and the minimal
 * intake path for the suppression collection - without it, that
 * collection exists but nothing in 9a can ever populate it (automated
 * opt-out processing from replies is milestone 9c's job).
 *
 * The commander wiring here is a thin layer: each subcommand group
 * (ingest, hotel-qualify, prescan, score, hotel-review, contacts,
 * preview, draft, outreach) lives in its own module under `prospect/`,
 * mirroring how `audit.ts` and `scan.ts` stay small. Real logic for each
 * pass lives in `@odysseus/interface` and `@odysseus/store`; see each
 * module's own header for the reasoning behind its shape (queued vs
 * inline, grouped `run` subcommand vs flat action).
 */

import type { Command } from 'commander';
import { registerIngestCommands } from './prospect/ingest.js';
import { registerHotelQualifyCommand } from './prospect/hotel-qualify.js';
import { registerPrescanCommand } from './prospect/prescan.js';
import { registerScoreCommand } from './prospect/score.js';
import { registerHotelReviewCommand } from './prospect/hotel-review.js';
import { registerContactsCommand } from './prospect/contacts.js';
import { registerPreviewCommand } from './prospect/preview.js';
import { registerDraftCommand } from './prospect/draft.js';
import { registerOutreachCommand } from './prospect/outreach.js';
import { registerWaveCommand } from './prospect/wave.js';

export function registerProspectCommand(program: Command): void {
  const prospect = program
    .command('prospect')
    .description(
      'Prospect acquisition and qualification. Milestone 9a against AFNIC + Sirene stock data, ' +
        'milestone 9c against the Atout France hotel catalogue.',
    );

  registerIngestCommands(prospect);
  registerHotelQualifyCommand(prospect);
  registerPrescanCommand(prospect);
  registerScoreCommand(prospect);
  registerHotelReviewCommand(prospect);
  registerContactsCommand(prospect);
  registerPreviewCommand(prospect);
  registerDraftCommand(prospect);
  registerOutreachCommand(prospect);
  registerWaveCommand(prospect);
}
