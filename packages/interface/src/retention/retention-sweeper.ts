/**
 * Plan 077: the scheduled retention run. It starts only where the
 * deployment asks for it (`ODYSSEUS_RETENTION_SWEEP=on`, set in
 * deploy/compose.yaml and nowhere else), so a local `odysseus serve` never
 * cleans the operator's calibration audits by itself. The first run waits
 * 15 minutes so a deploy restart does not sweep straight away; then once a
 * day. The sweeper never lifts the per-run cap: a run that would remove
 * more than the cap refuses and is recorded for the operator to read.
 */

import type { Connection } from 'mongoose';
import { getArtifactsRoot } from '@odysseus/scanner';
import { listProspectAudits, listProspectScopeJobIds } from '@odysseus/store';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { logger } from '../logger.js';
import { createConfiguredMailboxDraftAdapter } from '../outreach/configured-mailbox-draft-adapter.js';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { isReportProductionInFlight } from '../pipeline/report-production-lock.js';
import { runRetention, type RetentionRunOptions } from './apply-retention.js';
import { runProspectExpiry, type ProspectExpiryRunOptions } from './prospect-expiry.js';

const RETENTION_SWEEP_ENV_VAR = 'ODYSSEUS_RETENTION_SWEEP';
const PROSPECT_EXPIRY_ENV_VAR = 'ODYSSEUS_PROSPECT_EXPIRY';
export const RETENTION_SWEEP_FIRST_DELAY_MS = 15 * 60_000;
export const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60_000;

/** Only the exact value `on` enables it: a typo leaves it off. */
export function isRetentionSweepEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[RETENTION_SWEEP_ENV_VAR] === 'on';
}

/** Issue #538: the 90-day prospect expiry runs in the same daily sweep once
 *  the operator has read a production dry run and set this to exactly `on`
 *  (deploy/runbook.md). */
export function isProspectExpiryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[PROSPECT_EXPIRY_ENV_VAR] === 'on';
}

export interface RetentionSweeperDeps {
  /** The jobs the server's own queue is still running. */
  inFlightJobIds: () => readonly string[];
  run?: (options: RetentionRunOptions) => ReturnType<typeof runRetention>;
  expireProspects?: (options: ProspectExpiryRunOptions) => ReturnType<typeof runProspectExpiry>;
  prospectExpiryEnabled?: boolean;
}

export function startRetentionSweeper(
  connection: Connection,
  deps: RetentionSweeperDeps,
): () => void {
  const run = deps.run ?? runRetention;
  const expireProspects = deps.expireProspects ?? runProspectExpiry;
  const prospectExpiryEnabled = deps.prospectExpiryEnabled ?? isProspectExpiryEnabled();
  const isProspectWorkInFlight = async (prospectId: string): Promise<boolean> => {
    const inFlight = new Set(deps.inFlightJobIds());
    const jobIds = await listProspectScopeJobIds(connection, prospectId);
    if (jobIds.some((jobId) => inFlight.has(jobId))) return true;
    const audits = await listProspectAudits(connection, prospectId);
    return audits.some((audit) => isReportProductionInFlight(audit.auditId));
  };
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await run({
        connection,
        artifactsRoot: getArtifactsRoot(),
        store: createConfiguredArtifactStore(),
        now: new Date(),
        apply: true,
        allowLarge: false,
        trigger: 'sweeper',
        inProcess: {
          inFlightJobIds: deps.inFlightJobIds,
          isReportProductionInFlight,
        },
      });
      logger.info(
        {
          counts: result.counts,
          bytesReclaimed: result.bytesReclaimed,
          failures: result.failures.length,
          refusal: result.refusal,
        },
        'retention sweep finished',
      );
    } catch (error) {
      logger.error({ err: error }, 'retention sweep failed');
    }
    try {
      if (prospectExpiryEnabled) {
        const expiry = await expireProspects({
          connection,
          artifactsRoot: getArtifactsRoot(),
          store: createConfiguredArtifactStore(),
          publisher: createConfiguredPreviewPublisher,
          mailbox: createConfiguredMailboxDraftAdapter(),
          now: new Date(),
          apply: true,
          allowLarge: false,
          isWorkInFlight: isProspectWorkInFlight,
        });
        logger.info(
          {
            expired: expiry.deleted.length,
            kept: expiry.plan.kept.length,
            skipped: expiry.skipped.length,
            refusal: expiry.refusal,
          },
          'prospect expiry finished',
        );
      }
    } catch (error) {
      logger.error({ err: error }, 'prospect expiry failed');
    } finally {
      running = false;
    }
  };

  let interval: NodeJS.Timeout | undefined;
  const first = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), RETENTION_SWEEP_INTERVAL_MS);
    interval.unref();
  }, RETENTION_SWEEP_FIRST_DELAY_MS);
  first.unref();
  return () => {
    clearTimeout(first);
    if (interval !== undefined) clearInterval(interval);
  };
}
