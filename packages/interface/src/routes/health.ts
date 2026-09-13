import type { Connection } from 'mongoose';
import { sendJson } from '../http-utils.js';
import type { Router } from '../router.js';

export const LIVE_PATH = '/health/live';
export const READY_PATH = '/health/ready';

export interface HealthDependencies {
  connection: Connection;
  isQueueReady: () => boolean;
}

export function registerHealthRoutes(router: Router, deps: HealthDependencies): void {
  router.get(LIVE_PATH, ({ res }) => {
    sendJson(res, 200, { status: 'live' });
  });

  router.get(READY_PATH, async ({ res }) => {
    let databaseReady = false;
    try {
      if (deps.connection.db !== undefined) {
        await deps.connection.db.admin().ping();
        databaseReady = true;
      }
    } catch {
      // The response deliberately reports only the allowlisted dependency state.
    }

    const queueReady = deps.isQueueReady();
    sendJson(res, databaseReady && queueReady ? 200 : 503, {
      status: databaseReady && queueReady ? 'ready' : 'not-ready',
      database: databaseReady ? 'ok' : 'unavailable',
      queue: queueReady ? 'ok' : 'unavailable',
    });
  });
}
