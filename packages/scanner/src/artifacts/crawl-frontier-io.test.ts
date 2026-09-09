import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditConfigSnapshot } from '@odysseus/core';
import { ContinuationGuard } from '../continuation-guard.js';
import type { CrawlFrontierState, CrawlFrontierSnapshot } from '../crawl.js';
import {
  CRAWL_STATE_FILENAME,
  deleteCrawlFrontierState,
  isReusableFrontierState,
  readCrawlFrontierState,
  writeCrawlFrontierState,
} from './crawl-frontier-io.js';
import type { ScanToolIdentity } from './crawl-checkpoint-io.js';

let writtenTempDirs: string[] = [];

async function makeTempAuditDir(): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'odysseus-crawl-frontier-'));
  writtenTempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    writtenTempDirs.map((dir) => fs.promises.rm(dir, { recursive: true, force: true })),
  );
  writtenTempDirs = [];
});

const config: AuditConfigSnapshot = {
  maxPages: 10,
  maxDepth: 2,
  crawlDelayMs: 100,
  pageTimeoutMs: 30_000,
  lighthouseTimeoutMs: 60_000,
  renderSettleTimeoutMs: 8_000,
  userAgent: 'OdysseusAuditBot/test',
  scanConcurrency: 2,
  sitemapMode: 'supplement',
};

const toolIdentity: ScanToolIdentity = {
  format: 'full-audit-crawl-checkpoint-v1',
  scannerVersion: '0.1.0',
  plannerVersion: 'v1',
};

const startedAt = new Date('2026-09-09T00:00:00.000Z');

function frontierState(overrides: Partial<CrawlFrontierState> = {}): CrawlFrontierState {
  const guard = new ContinuationGuard();
  guard.admit({ basis: 'rel-next', familyKey: 'path:/blog/page/{n}' }, 'https://example.com/x');
  const state: CrawlFrontierSnapshot = {
    startUrlIdentity: 'https://example.com',
    robotsText: 'User-agent: *\nDisallow: /private\n',
    supplementalPhaseStarted: false,
    queue: [
      {
        url: 'https://example.com/b',
        depth: 1,
        discoveredFrom: 'https://example.com',
        discoveryMethod: 'link',
      },
    ],
    visited: ['https://example.com'],
    pages: [
      {
        url: 'https://example.com',
        depth: 0,
        status: 'visited',
        httpStatus: 200,
        discoveryMethod: 'link',
      },
    ],
    linkDiscoveredUrls: ['https://example.com', 'https://example.com/b'],
    linkDiscoveredFrom: [['https://example.com/b', 'https://example.com']],
    guard: guard.snapshot(),
    sitemap: undefined,
    eligibleSitemapUrls: [],
    filteredSitemapPageCount: 0,
  };
  return {
    format: 'full-audit-crawl-frontier-v1',
    startedAt: startedAt.toISOString(),
    config,
    toolIdentity,
    state,
    ...overrides,
  };
}

const expected = { startedAt, config, toolIdentity };

describe('crawl frontier io', () => {
  it('round trips a frontier state through write and read', async () => {
    const auditDir = await makeTempAuditDir();
    const original = frontierState();

    writeCrawlFrontierState(auditDir, original);

    expect(readCrawlFrontierState(auditDir)).toEqual(original);
  });

  it('writes atomically, leaving no temp file behind', async () => {
    const auditDir = await makeTempAuditDir();

    writeCrawlFrontierState(auditDir, frontierState());

    expect(fs.readdirSync(auditDir)).toEqual([CRAWL_STATE_FILENAME]);
  });

  it('reads a corrupt file as undefined', async () => {
    const auditDir = await makeTempAuditDir();
    fs.writeFileSync(path.join(auditDir, CRAWL_STATE_FILENAME), '{ not json at all');

    expect(readCrawlFrontierState(auditDir)).toBeUndefined();
  });

  it('reads a missing file as undefined', async () => {
    const auditDir = await makeTempAuditDir();

    expect(readCrawlFrontierState(auditDir)).toBeUndefined();
  });

  it('deleting the frontier state tolerates absence', async () => {
    const auditDir = await makeTempAuditDir();

    expect(() => deleteCrawlFrontierState(auditDir)).not.toThrow();
  });

  it('deletes the frontier state file when present', async () => {
    const auditDir = await makeTempAuditDir();
    writeCrawlFrontierState(auditDir, frontierState());

    deleteCrawlFrontierState(auditDir);

    expect(fs.readdirSync(auditDir)).toEqual([]);
  });

  describe('isReusableFrontierState', () => {
    it('accepts a frontier state whose everything matches', () => {
      expect(isReusableFrontierState(frontierState(), expected)).toEqual({ reusable: true });
    });

    it('rejects an absent frontier state as missing', () => {
      expect(isReusableFrontierState(undefined, expected)).toEqual({
        reusable: false,
        reason: 'missing',
      });
    });

    it('rejects structurally invalid data as corrupt', () => {
      expect(
        isReusableFrontierState({ nope: true } as unknown as CrawlFrontierState, expected),
      ).toEqual({ reusable: false, reason: 'corrupt' });
    });

    it('rejects a state whose inner guard block is missing as corrupt', () => {
      const withoutGuard = frontierState();
      delete (withoutGuard.state as unknown as Record<string, unknown>)['guard'];
      expect(isReusableFrontierState(withoutGuard, expected)).toEqual({
        reusable: false,
        reason: 'corrupt',
      });
    });

    it('rejects an unknown frontier format version', () => {
      const future = {
        ...frontierState(),
        format: 'full-audit-crawl-frontier-v2',
      } as unknown as CrawlFrontierState;
      expect(isReusableFrontierState(future, expected)).toEqual({
        reusable: false,
        reason: 'version-mismatch',
      });
    });

    it('rejects a guard snapshot written by another guard version', () => {
      const state = frontierState();
      (state.state.guard as { guardVersion: string }).guardVersion = 'v999';
      expect(isReusableFrontierState(state, expected)).toEqual({
        reusable: false,
        reason: 'version-mismatch',
      });
    });

    it('rejects a guard snapshot whose family cap does not match the current constant', () => {
      const state = frontierState();
      (state.state.guard as { familyMaxEnqueued: number }).familyMaxEnqueued = 1;
      expect(isReusableFrontierState(state, expected)).toEqual({
        reusable: false,
        reason: 'version-mismatch',
      });
    });

    it('rejects a changed config value', () => {
      expect(
        isReusableFrontierState(frontierState({ config: { ...config, crawlDelayMs: 999 } }), {
          startedAt,
          config,
          toolIdentity,
        }),
      ).toEqual({ reusable: false, reason: 'config-mismatch' });
    });

    it('rejects a changed tool identity (planner version moved)', () => {
      expect(
        isReusableFrontierState(
          frontierState({ toolIdentity: { ...toolIdentity, plannerVersion: 'v2' } }),
          expected,
        ),
      ).toEqual({ reusable: false, reason: 'tool-mismatch' });
    });

    it('rejects a frontier state stamped by another audit run', () => {
      expect(
        isReusableFrontierState(frontierState({ startedAt: '2026-09-08T00:00:00.000Z' }), expected),
      ).toEqual({ reusable: false, reason: 'started-at-mismatch' });
    });
  });
});
