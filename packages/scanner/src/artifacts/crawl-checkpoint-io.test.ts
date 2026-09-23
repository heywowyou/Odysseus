import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditConfigSnapshot } from '@odysseus/core';
import type { CrawlResult } from '../crawl.js';
import {
  CRAWL_CHECKPOINT_FILENAME,
  CRAWL_STATE_FILENAME,
  buildScanToolIdentity,
  deleteCrawlCheckpoint,
  deleteCrawlStateFile,
  isReusableCheckpoint,
  jsonDeepEqual,
  readCrawlCheckpoint,
  writeCrawlCheckpoint,
  type CrawlCheckpoint,
  type ScanToolIdentity,
} from './crawl-checkpoint-io.js';

let writtenTempDirs: string[] = [];

async function makeTempAuditDir(): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'odysseus-crawl-checkpoint-'));
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

function minimalCrawl(): CrawlResult {
  return {
    startUrl: 'https://example.com/',
    pages: [
      {
        url: 'https://example.com/',
        depth: 0,
        status: 'visited',
        discoveryMethod: 'seed',
      },
    ],
    visitedCount: 1,
    maxPages: 10,
    maxDepth: 2,
    robotsTxtFound: true,
    effectiveDelayMs: 100,
    robotsSitemapUrls: [],
    robotsDisallowMatches: [],
    aiCrawlerBlocks: [],
    linkDiscoveredUrls: [],
  };
}

function checkpoint(overrides: Partial<CrawlCheckpoint> = {}): CrawlCheckpoint {
  return {
    checkpointVersion: 'v1',
    startedAt: '2026-09-09T00:00:00.000Z',
    config,
    toolIdentity,
    crawl: minimalCrawl(),
    ...overrides,
  };
}

const startedAt = new Date('2026-09-09T00:00:00.000Z');

describe('crawl checkpoint io', () => {
  it('round trips a checkpoint through write and read', async () => {
    const auditDir = await makeTempAuditDir();
    const original = checkpoint();

    writeCrawlCheckpoint(auditDir, original);

    expect(readCrawlCheckpoint(auditDir)).toEqual(original);
  });

  it('writes atomically, leaving no temp file behind', async () => {
    const auditDir = await makeTempAuditDir();

    writeCrawlCheckpoint(auditDir, checkpoint());

    expect(fs.readdirSync(auditDir)).toEqual([CRAWL_CHECKPOINT_FILENAME]);
  });

  it('reads a corrupt file as undefined', async () => {
    const auditDir = await makeTempAuditDir();
    fs.writeFileSync(path.join(auditDir, CRAWL_CHECKPOINT_FILENAME), '{ not json at all');

    expect(readCrawlCheckpoint(auditDir)).toBeUndefined();
  });

  it('reads a missing file as undefined', async () => {
    const auditDir = await makeTempAuditDir();

    expect(readCrawlCheckpoint(auditDir)).toBeUndefined();
  });

  it('deleting the checkpoint and the state file tolerates absence', async () => {
    const auditDir = await makeTempAuditDir();

    expect(() => deleteCrawlCheckpoint(auditDir)).not.toThrow();
    expect(() => deleteCrawlStateFile(auditDir)).not.toThrow();
  });

  it('deletes each checkpoint file when present', async () => {
    const auditDir = await makeTempAuditDir();
    writeCrawlCheckpoint(auditDir, checkpoint());
    fs.writeFileSync(path.join(auditDir, CRAWL_STATE_FILENAME), '{}');

    deleteCrawlCheckpoint(auditDir);
    deleteCrawlStateFile(auditDir);

    expect(fs.readdirSync(auditDir)).toEqual([]);
  });

  it('builds a tool identity carrying the scanner package version and planner version', () => {
    const identity = buildScanToolIdentity();

    expect(identity.format).toBe('full-audit-crawl-checkpoint-v1');
    expect(identity.scannerVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(identity.plannerVersion).toBe('v3');
  });

  describe('isReusableCheckpoint', () => {
    const expected = { startedAt, config, toolIdentity, scopeDigest: undefined };

    it('accepts a checkpoint whose everything matches', () => {
      expect(isReusableCheckpoint(checkpoint(), expected)).toEqual({ reusable: true });
    });

    it('rejects an absent checkpoint as missing', () => {
      expect(isReusableCheckpoint(undefined, expected)).toEqual({
        reusable: false,
        reason: 'missing',
      });
    });

    it('rejects structurally invalid JSON data as corrupt', () => {
      expect(isReusableCheckpoint({ nope: true } as unknown as CrawlCheckpoint, expected)).toEqual({
        reusable: false,
        reason: 'corrupt',
      });
    });

    it('rejects an unknown checkpoint format version', () => {
      const future = { ...checkpoint(), checkpointVersion: 'v2' } as unknown as CrawlCheckpoint;
      expect(isReusableCheckpoint(future, expected)).toEqual({
        reusable: false,
        reason: 'version-mismatch',
      });
    });

    it('rejects a changed config value', () => {
      expect(
        isReusableCheckpoint(checkpoint({ config: { ...config, crawlDelayMs: 999 } }), expected),
      ).toEqual({ reusable: false, reason: 'config-mismatch' });
    });

    it('rejects a changed tool identity (planner version moved)', () => {
      expect(
        isReusableCheckpoint(
          checkpoint({ toolIdentity: { ...toolIdentity, plannerVersion: 'v2' } }),
          expected,
        ),
      ).toEqual({ reusable: false, reason: 'tool-mismatch' });
    });

    it('rejects a checkpoint stamped by another audit run', () => {
      expect(
        isReusableCheckpoint(checkpoint({ startedAt: '2026-09-08T00:00:00.000Z' }), expected),
      ).toEqual({ reusable: false, reason: 'started-at-mismatch' });
    });

    it('rejects a checkpoint crawled under another audit scope', () => {
      const scoped = `sha256:${'a'.repeat(64)}`;
      expect(isReusableCheckpoint(checkpoint({ scopeDigest: scoped }), expected)).toEqual({
        reusable: false,
        reason: 'scope-mismatch',
      });
      expect(
        isReusableCheckpoint(checkpoint({ scopeDigest: scoped }), {
          ...expected,
          scopeDigest: scoped,
        }),
      ).toEqual({ reusable: true });
    });
  });

  describe('jsonDeepEqual', () => {
    it('ignores key insertion order', () => {
      expect(jsonDeepEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    });

    it('distinguishes a changed nested value', () => {
      expect(jsonDeepEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
    });

    it('distinguishes a missing nested key', () => {
      expect(jsonDeepEqual({ a: { b: 1, c: 2 } }, { a: { b: 1 } })).toBe(false);
    });

    it('compares arrays element-wise', () => {
      expect(jsonDeepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
      expect(jsonDeepEqual([1, 2], [2, 1])).toBe(false);
    });

    it('never equates a primitive with its object wrapper shape', () => {
      expect(jsonDeepEqual({ a: null }, { a: 0 })).toBe(false);
      expect(jsonDeepEqual('x', { 0: 'x' })).toBe(false);
    });
  });
});
