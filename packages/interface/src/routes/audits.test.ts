import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  getAudit: vi.fn(),
  getFindingsForAudit: vi.fn(),
  getSeverityRollup: vi.fn(),
  getLatestReport: vi.fn(),
  listReportLanguages: vi.fn(),
}));

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-audit-dir'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
}));

import {
  getAudit,
  getFindingsForAudit,
  getSeverityRollup,
  listReportLanguages,
} from '@odysseus/store';
import { Router } from '../router.js';
import { registerAuditRoutes } from './audits.js';

function fakeReq(url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = 'GET';
  req.url = url;
  return req;
}

function fakeRes(): ServerResponse & { statusCode: number; body: string | undefined } {
  const res = {
    statusCode: 200,
    body: undefined as string | undefined,
    setHeader: vi.fn(),
    end: vi.fn(function (this: { body: string | undefined }, chunk?: string) {
      this.body = chunk;
    }),
  };
  return res as never;
}

const fakeConnection = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAudit).mockResolvedValue({
    auditId: 'audit-1',
    siteUrl: 'https://example.com/',
    startedAt: new Date('2026-08-08T10:00:00.000Z'),
    finishedAt: new Date('2026-08-08T10:05:00.000Z'),
    crawl: { visitedCount: 5 },
  } as never);
  vi.mocked(getFindingsForAudit).mockResolvedValue([]);
  vi.mocked(getSeverityRollup).mockResolvedValue({} as never);
  vi.mocked(listReportLanguages).mockResolvedValue(['fr', 'en']);
});

describe('GET /api/audits/:auditId', () => {
  it('includes reportLanguages', async () => {
    const router = new Router();
    registerAuditRoutes(router, fakeConnection);

    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.reportLanguages).toEqual(['fr', 'en']);
  });

  it('returns an empty reportLanguages array when no report has been generated yet', async () => {
    vi.mocked(listReportLanguages).mockResolvedValue([]);

    const router = new Router();
    registerAuditRoutes(router, fakeConnection);

    const req = fakeReq('/api/audits/audit-1');
    const res = fakeRes();
    await router.handle(req, res);

    const body = JSON.parse(res.body ?? '{}');
    expect(body.reportLanguages).toEqual([]);
  });
});
