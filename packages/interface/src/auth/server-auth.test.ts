import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Connection } from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  refusesUnprotectedNonLoopbackBind,
  startInterfaceServer,
  type InterfaceServerHandle,
} from '../server.js';
import { SESSION_COOKIE_NAME } from './session-store.js';

// Boot only reaches these three store functions before Mongo answers
// anything, and the fake Connection has no Mongo behind it, so they are
// stubbed to harmless no-ops while every other export stays real. The
// audit reads mirror the /api/audits/:auditId handler's read set (see
// routes/audits.test.ts), so the authenticated leg answers 200 the same
// way a real database would.
vi.mock('@odysseus/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/store')>();
  const { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT } = await import('@odysseus/core');
  const findingsProvenance = {
    findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
    normalizationFingerprint: NORMALIZATION_FINGERPRINT,
    findingsDigest: `sha256:${'0'.repeat(64)}`,
  };
  return {
    ...actual,
    verifyUniqueIndexes: vi.fn(async () => []),
    migrateOutreachDraftThreadTouchIndex: vi.fn(async () => 'current'),
    resetOrphanedRunningJobs: vi.fn(async () => 0),
    settleCancelRequestedJobsOnStartup: vi.fn(async () => 0),
    backfillQueueOrder: vi.fn(async () => 0),
    reconcileFailedAuditJobs: vi.fn(async () => 0),
    claimNextQueuedJob: vi.fn(async () => null),
    getAudit: vi.fn(async () => ({
      auditId: 'audit-1',
      siteUrl: 'https://example.com/',
      startedAt: new Date('2026-08-08T10:00:00.000Z'),
      finishedAt: new Date('2026-08-08T10:05:00.000Z'),
      findingsProvenance,
      crawl: { visitedCount: 5 },
      pages: [],
    })),
    getFindingsForAudit: vi.fn(async () => []),
    listReportLanguages: vi.fn(async () => ['fr', 'en']),
    resolveSelectedAnalysisPairForAudit: vi.fn(async () => ({
      kind: 'none',
      reason: 'no-analyses',
    })),
    getLatestReport: vi.fn(async () => null),
    // Plan 072: the detail handler also asks which report each language's
    // current row is, so the finalized badge can be projected.
    getLatestFinalizedReport: vi.fn(async () => null),
    getLatestReportApproval: vi.fn(async () => null),
    // Plan 060 snapshot reads (audit-readiness axes): nothing recorded.
    getLatestReportBundle: vi.fn(async () => null),
    getActiveReportBundle: vi.fn(async () => null),
    createReportQualityRunModel: vi.fn(() => ({
      findOne: vi.fn(() => ({
        sort: vi.fn(() => ({
          lean: vi.fn(async () => null),
        })),
      })),
    })),
    createJobModel: vi.fn(() => ({
      findOne: vi.fn(() => ({
        sort: vi.fn(() => ({
          lean: vi.fn(async () => null),
        })),
      })),
    })),
  };
});

// The mock factory runs at import time but the getter runs per request, so
// this holder lets beforeAll point the static fallback at a temp dir that
// does not exist yet while this module is still loading.
const testPublicDir = { current: '' };
vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    getPublicDir: () => testPublicDir.current,
  };
});

describe('refusesUnprotectedNonLoopbackBind', () => {
  it.each(['127.0.0.1', '::1', 'localhost'])(
    'keeps the historical no-auth posture on loopback %s',
    (host) => {
      expect(refusesUnprotectedNonLoopbackBind(host, false)).toBe(false);
    },
  );

  it.each(['0.0.0.0', '::', '10.0.0.5', 'app.odysseusaudit.com'])(
    'refuses the public bind %s without auth',
    (host) => {
      expect(refusesUnprotectedNonLoopbackBind(host, false)).toBe(true);
    },
  );

  it('allows any host once a password hash is configured', () => {
    expect(refusesUnprotectedNonLoopbackBind('0.0.0.0', true)).toBe(false);
    expect(refusesUnprotectedNonLoopbackBind('app.odysseusaudit.com', true)).toBe(false);
  });

  it('tolerates casing and stray whitespace on loopback hosts', () => {
    expect(refusesUnprotectedNonLoopbackBind(' LocalHost ', false)).toBe(false);
  });
});

describe('startInterfaceServer refuse-to-start', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws before listening when unauthenticated on a non-loopback host', async () => {
    vi.stubEnv('ODYSSEUS_INTERFACE_HOST', '0.0.0.0');
    const connection = {} as Connection;
    await expect(startInterfaceServer(connection, { getPasswordHash: () => null })).rejects.toThrow(
      /ODYSSEUS_DASHBOARD_PASSWORD_HASH/,
    );
  });
});

describe('startInterfaceServer auth composition', () => {
  const scrypt = promisify(scryptCallback);
  const PASSWORD = 'another strong operator password';
  const INDEX_HTML = '<!doctype html><html lang="en"><body>auth composition fixture</body></html>';

  let configuredHash = '';
  let staticDir = '';
  let handle: InterfaceServerHandle | undefined;

  function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;
        probe.close(() => resolve(port));
      });
      probe.on('error', reject);
    });
  }

  beforeAll(async () => {
    const salt = randomBytes(16);
    const hash = await scrypt(PASSWORD, salt, 64);
    configuredHash = `${salt.toString('hex')}:${(hash as Buffer).toString('hex')}`;

    staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-auth-'));
    await fs.writeFile(path.join(staticDir, 'index.html'), INDEX_HTML);
    testPublicDir.current = staticDir;

    // getInterfacePort reads the env at call time and rejects 0, so the
    // probe-then-stub order matters.
    vi.stubEnv('ODYSSEUS_INTERFACE_PORT', String(await findFreePort()));
    // No sessionStore or rateLimiter is injected on purpose: the whole
    // point is that the server's own single shared store both issues the
    // login cookie and validates it afterwards.
    handle = await startInterfaceServer({} as Connection, {
      getPasswordHash: () => configuredHash,
    });
  });

  afterAll(async () => {
    // fetch pools keep-alive sockets that would otherwise hold
    // server.close open until the client's own keep-alive timeout.
    handle?.server.closeIdleConnections();
    await handle?.close();
    if (staticDir !== '') await fs.rm(staticDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('issues and validates its own session across the login, guard and static paths', async () => {
    expect(handle).toBeDefined();
    const base = handle!.url;

    const live = await fetch(`${base}/health/live`);
    expect(live.status).toBe(200);
    expect(await live.text()).toBe('{"status":"live"}');

    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.text()).toBe('{"status":"not-ready","database":"unavailable","queue":"ok"}');

    const unauthenticated = await fetch(`${base}/api/audits/audit-1`);
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.text()).toBe('{"error":"unauthenticated"}');

    const login = await fetch(`${base}/api/session/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(login.status).toBe(204);
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie.startsWith(SESSION_COOKIE_NAME)).toBe(true);

    // Only the server's own store could have issued this cookie, so a 200
    // here is the composition assertion: the guard validates against the
    // same store the login route wrote to.
    const authenticated = await fetch(`${base}/api/audits/audit-1`, {
      headers: { cookie: setCookie },
    });
    expect(authenticated.status).toBe(200);

    // redirect: manual, because fetch would otherwise follow the 302 into
    // the SPA /login fallback and the status would be unreadable.
    const page = await fetch(base, { redirect: 'manual' });
    expect(page.status).toBe(302);
    expect(page.headers.get('location')).toBe('/login');

    const asset = await fetch(`${base}/index.html`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe(INDEX_HTML);
  });
});
