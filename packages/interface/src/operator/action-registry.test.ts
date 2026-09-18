import type { Connection } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Router } from '../router.js';
import { registerAuditRoutes } from '../routes/audits.js';
import { registerHealthRoutes } from '../routes/health.js';
import { registerMetaRoutes } from '../routes/meta.js';
import { registerProspectHubRoutes } from '../routes/prospect-hub.js';
import { registerReportPreparationRoutes } from '../routes/report-preparation.js';
import { registerScanRoutes } from '../routes/scans.js';
import { registerStaticFallback } from '../routes/static.js';
import type { JobQueue } from '../queue/job-queue.js';
import { registerSessionRoutes } from '../auth/session-routes.js';
import type { LoginRateLimiter } from '../auth/rate-limit.js';
import type { SessionStore } from '../auth/session-store.js';
import { CAPABILITY_BLOCK_REASONS, CAPABILITY_CONSEQUENCES } from './contract.js';
import {
  CONSEQUENTIAL_ACTION_CODES,
  REGISTRY_ACTIONS,
  type ConsequentialAction,
} from './action-registry.js';

/**
 * Plan 060 §16.1/§19 closure proofs for the consequential-action registry:
 *
 * 1. the route inventory — every registry row's route exists on the real
 *    router, and every mutating route the server registers is either a
 *    registry row or on the explicit non-mutating exemption list, so a new
 *    consequential mutation without a registry entry fails here;
 * 2. registry coherence — protocols, token inputs and codes stay inside the
 *    closed vocabularies of contract.ts.
 *
 * The FR/EN copy closure for the contract vocabularies lives on the
 * dashboard side (dashboard/lib/copy-closure.test.ts): the server
 * tsconfig excludes src/dashboard, so that half cannot import the i18n
 * tables from here.
 */

/** The real routing table, assembled exactly as server.ts does. Handlers
 *  never run: registration only records patterns, so stub dependencies are
 *  enough. `createConfiguredArtifactStore()` answers undefined without
 *  bucket credentials, as on every developer machine. */
function serverRouteTable(): { method: string; pattern: string }[] {
  const router = new Router();
  const connection = {} as Connection;
  const queue = {
    notify: () => undefined,
    requestCancel: () => undefined,
    isJobInFlight: () => false,
  } as unknown as JobQueue;
  const sessionStore: SessionStore = {
    create: () => 't',
    validate: () => false,
    delete: () => undefined,
  };
  const rateLimiter: LoginRateLimiter = {
    check: () => ({ allowed: true }),
    recordFailure: () => undefined,
    recordSuccess: () => undefined,
  };

  registerHealthRoutes(router, { connection, isQueueReady: () => true });
  registerMetaRoutes(router);
  registerScanRoutes(router, connection, queue);
  registerAuditRoutes(router, connection);
  registerReportPreparationRoutes(router, connection);
  registerProspectHubRoutes(router, connection, { isJobInFlight: () => false });
  registerSessionRoutes(router, { getPasswordHash: () => null, sessionStore, rateLimiter });
  registerStaticFallback(router);
  return router.routeTable();
}

/** POST/PUT/PATCH/DELETE routes that persist nothing or only manage the
 *  session, each with the reason it carries no consequential-action row.
 *  The inventory test fails when a route is added here without this
 *  justification being updated, and when a route outside the registry and
 *  this list appears — fail-closed in both directions. */
const NON_MUTATING_ROUTES: Record<string, string> = {
  // Resolves a SIREN against the Sirene registry and echoes the result;
  // nothing is persisted (the confirming write is `confirmManualField`).
  'POST /api/audits/:auditId/manual-fields/siren-preview': 'read-only lookup',
  // Hashes the address in memory and answers suppressed/not; nothing is
  // persisted, echoed or listed.
  'POST /api/outreach/suppression-check': 'read-only check',
  // Session lifecycle: the auth guard and the login rate limiter own these,
  // and no operator-work capability applies to them.
  'POST /api/session/login': 'session lifecycle',
  'POST /api/session/logout': 'session lifecycle',
};

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

describe('consequential-action route inventory (plan 060 §16.1)', () => {
  const table = serverRouteTable();
  const tableEntries = table.map(({ method, pattern }) => `${method} ${pattern}`);
  const mutationEntries = tableEntries.filter((entry) =>
    MUTATION_METHODS.has(entry.split(' ')[0] ?? ''),
  );
  const registryRoutes: readonly string[] = REGISTRY_ACTIONS.flatMap((row) => [...row.routes]);

  it('registers the route set this inventory was derived from', () => {
    // Not vacuous: the real router must still hold every read route the
    // dashboard polls and this inventory walked.
    expect(tableEntries.length).toBeGreaterThanOrEqual(60);
    for (const canary of [
      'GET /api/scans',
      'GET /api/scans/queue',
      'GET /api/scans/:jobId',
      'GET /api/audits/:auditId',
      'GET /api/prospect-hub/todo',
      'GET /api/prospects/:prospectId',
    ]) {
      expect(tableEntries).toContain(canary);
    }
  });

  it('keeps every registry route on the real router, verbatim', () => {
    const unknown = registryRoutes.filter((route) => !tableEntries.includes(route));
    expect(unknown).toEqual([]);
  });

  it('has a registry row or an explicit exemption for every mutation route', () => {
    const unknown = mutationEntries.filter(
      (entry) => !registryRoutes.includes(entry) && !(entry in NON_MUTATING_ROUTES),
    );
    expect(unknown).toEqual([]);
  });

  it('pins the exact mutation set, so a removed route updates the registry too', () => {
    const expected = [...registryRoutes, ...Object.keys(NON_MUTATING_ROUTES)].sort();
    expect([...mutationEntries].sort()).toEqual(expected);
  });

  it('keeps every registry action code unique', () => {
    expect(new Set(CONSEQUENTIAL_ACTION_CODES).size).toBe(REGISTRY_ACTIONS.length);
  });
});

describe('registry coherence (plan 060 §6/§19)', () => {
  // The widened interface: `as const` literals satisfy it by construction,
  // and these checks re-prove the same facts at runtime for the closure
  // ledger (plan 060 §16.1: the proof must fail, not merely trust).
  const rows: readonly ConsequentialAction[] = REGISTRY_ACTIONS;

  it('uses only the two command protocols', () => {
    for (const row of rows) {
      expect(['state-token', 'reload-recheck']).toContain(row.protocol);
    }
  });

  it('names token inputs exactly on the state-token rows and nowhere else', () => {
    for (const row of rows) {
      if (row.protocol === 'state-token') {
        expect(row.tokenInputs, `${row.action} must name its token inputs`).toBeDefined();
        expect(row.tokenInputs?.length).toBeGreaterThan(0);
      } else {
        expect(
          row.tokenInputs,
          `${row.action} is reload-recheck and carries no token`,
        ).toBeUndefined();
      }
      // Plan 061 upgrades exactly the rows the state-token protocol has not
      // reached yet; the flag must never drift from the protocol.
      expect(row.pendingPlan061).toBe(row.protocol !== 'state-token');
    }
    // The plan-061 implemented subset is exactly these three commands.
    const stateTokenActions = rows
      .filter((row) => row.protocol === 'state-token')
      .map((row) => row.action)
      .sort();
    expect(stateTokenActions).toEqual(['cancelScan', 'deleteScan', 'reorderScanQueue']);
  });

  it('uses only the closed capability codes of contract.ts', () => {
    for (const row of rows) {
      for (const code of row.consequenceCodes ?? []) {
        expect(CAPABILITY_CONSEQUENCES).toContain(code);
      }
      for (const code of row.blockedReasonCodes ?? []) {
        expect(CAPABILITY_BLOCK_REASONS).toContain(code);
      }
    }
  });

  it('maps every row under an owning policy', () => {
    const owners = new Set(rows.map((row) => row.owner));
    for (const owner of owners) {
      expect([
        'scan-job',
        'prospect-store',
        'audit-evidence',
        'report-quality',
        'outreach',
        'report-preparation',
      ]).toContain(owner);
    }
  });
});
