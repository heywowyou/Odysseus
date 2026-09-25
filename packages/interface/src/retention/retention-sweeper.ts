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
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { logger } from '../logger.js';
import { isReportProductionInFlight } from '../pipeline/report-production-lock.js';
import { runRetention, type RetentionRunOptions } from './apply-retention.js';

export const RETENTION_SWEEP_ENV_VAR = 'ODYSSEUS_RETENTION_SWEEP';
export const RETENTION_SWEEP_FIRST_DELAY_MS = 15 * 60_000;
export const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60_000;

/** Only the exact value `on` enables it: a typo leaves it off. */
export function isRetentionSweepEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[RETENTION_SWEEP_ENV_VAR] === 'on';
}

export interface RetentionSweeperDeps {
  queue: { listInFlightJobIds(): readonly string[] };
  run?: (options: RetentionRunOptions) => ReturnType<typeof runRetention>;
}

export function startRetentionSweeper(
  connection: Connection,
  deps: RetentionSweeperDeps,
): () => void {
  const run = deps.run ?? runRetention;
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
          inFlightJobIds: () => deps.queue.listInFlightJobIds(),
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
