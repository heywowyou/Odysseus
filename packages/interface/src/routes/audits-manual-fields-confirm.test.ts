import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Plan 045 slice 1.3: POST /api/audits/:auditId/manual-fields/confirm.
// makeReportReady's own behaviour (stale-findings refresh, each refusal
// kind) is already covered by pipeline/make-report-ready.test.ts; this
// route is tested here in isolation from it, mocking only the one call it
// makes, so these tests assert the route's own three-way branch: another
// detected identity field still awaits confirmation, nothing left to await
// so it tries to make the PDFs and succeeds, or that attempt refuses.

vi.mock('@odysseus/store', () => ({
  getAuditRuntimeFields: vi.fn(),
  getAuditSlimmedAt: vi.fn(async () => undefined),
  saveLinkedAuditIdentity: vi.fn(),
  setAuditManualFields: vi.fn(),
}));

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => '/tmp/fake-confirm-audit-dir'),
  buildArtifactBucketKey: vi.fn(() => 'irrelevant'),
  getArtifactsRoot: vi.fn(() => '/tmp'),
  ensureEnvLoaded: vi.fn(),
  findWorkspaceRoot: vi.fn(() => '/tmp'),
}));

vi.mock('../pipeline/make-report-ready.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pipeline/make-report-ready.js')>()),
  makeReportReady: vi.fn(),
}));

import {
  getAuditRuntimeFields,
  saveLinkedAuditIdentity,
  setAuditManualFields,
} from '@odysseus/store';
import { makeReportReady } from '../pipeline/make-report-ready.js';
import { Router } from '../router.js';
import { registerAuditRoutes } from './audits.js';

function fakeReq(url: string, body: unknown): IncomingMessage {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = url;
  req.headers = {};
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

function manualFieldsWith(entries: Record<string, { value: string; provenance: string }>): never {
  return entries as never;
}

async function post(
  body: unknown,
): Promise<ServerResponse & { statusCode: number; body: string | undefined }> {
  const router = new Router();
  registerAuditRoutes(router, fakeConnection);
  const req = fakeReq('/api/audits/audit-1/manual-fields/confirm', body);
  const res = fakeRes();
  await router.handle(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuditRuntimeFields).mockResolvedValue({
    auditId: 'audit-1',
    siteUrl: 'https://example.com/',
    startedAt: new Date('2026-08-08T10:00:00.000Z'),
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/audits/:auditId/manual-fields/confirm', () => {
  it('rejects a field name the identity gate does not recognize', async () => {
    const res = await post({ field: 'siren', value: '123456789' });
    expect(res.statusCode).toBe(400);
    expect(setAuditManualFields).not.toHaveBeenCalled();
  });

  it('rejects an empty value', async () => {
    const res = await post({ field: 'nomCommercial', value: '   ' });
    expect(res.statusCode).toBe(400);
    expect(setAuditManualFields).not.toHaveBeenCalled();
  });

  it('saves a confirmed name on the linked prospect instead of the audit', async () => {
    vi.mocked(getAuditRuntimeFields).mockResolvedValue({
      auditId: 'audit-1',
      siteUrl: 'https://example.com/',
      startedAt: new Date('2026-08-08T10:00:00.000Z'),
      prospectId: 'prospect-1',
    } as never);
    vi.mocked(saveLinkedAuditIdentity).mockResolvedValue(
      manualFieldsWith({
        nomCommercial: { value: 'Nouveau Nom', provenance: 'operator' },
        raisonSociale: { value: 'O2SWITCH', provenance: 'detected' },
      }),
    );

    const res = await post({ field: 'nomCommercial', value: ' Nouveau Nom ' });

    expect(res.statusCode).toBe(200);
    expect(saveLinkedAuditIdentity).toHaveBeenCalledWith(fakeConnection, 'audit-1', 'prospect-1', {
      nomCommercial: 'Nouveau Nom',
    });
    expect(setAuditManualFields).not.toHaveBeenCalled();
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({
      manualFields: { nomCommercial: { value: 'Nouveau Nom' } },
    });
  });

  it('keeps saving a confirmed name on an unlinked audit', async () => {
    vi.mocked(setAuditManualFields).mockResolvedValue(
      manualFieldsWith({
        nomCommercial: { value: 'Les Flots Bleus', provenance: 'operator' },
        raisonSociale: { value: 'O2SWITCH', provenance: 'detected' },
      }),
    );

    await post({ field: 'nomCommercial', value: 'Les Flots Bleus' });

    expect(setAuditManualFields).toHaveBeenCalled();
    expect(saveLinkedAuditIdentity).not.toHaveBeenCalled();
  });

  it('waits when the other identity field is still a detected, unconfirmed guess', async () => {
    vi.mocked(setAuditManualFields).mockResolvedValue(
      manualFieldsWith({
        nomCommercial: { value: 'Les Flots Bleus', provenance: 'operator' },
        raisonSociale: { value: 'O2SWITCH', provenance: 'detected' },
      }),
    );

    const res = await post({ field: 'nomCommercial', value: 'Les Flots Bleus' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({ pdfs: 'waiting-other-field' });
    expect(setAuditManualFields).toHaveBeenCalledWith(fakeConnection, 'audit-1', {
      nomCommercial: { value: 'Les Flots Bleus', provenance: 'operator' },
    });
    expect(makeReportReady).not.toHaveBeenCalled();
  });

  it('generates the reports once no detected identity field remains', async () => {
    vi.mocked(setAuditManualFields).mockResolvedValue(
      manualFieldsWith({
        nomCommercial: { value: 'Les Flots Bleus', provenance: 'operator' },
        raisonSociale: { value: 'SARL Les Flots Bleus', provenance: 'operator' },
      }),
    );
    vi.mocked(makeReportReady).mockResolvedValue({
      kind: 'ready',
      reports: [],
      findingsWereRefreshed: false,
    });

    const res = await post({ field: 'raisonSociale', value: 'SARL Les Flots Bleus' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({ pdfs: 'generated' });
  });

  it('surfaces makeReportReady’s own refusal instead of claiming success', async () => {
    vi.mocked(setAuditManualFields).mockResolvedValue(
      manualFieldsWith({
        nomCommercial: { value: 'Les Flots Bleus', provenance: 'operator' },
        raisonSociale: { value: 'SARL Les Flots Bleus', provenance: 'operator' },
      }),
    );
    vi.mocked(makeReportReady).mockResolvedValue({
      kind: 'refused',
      refusal: { kind: 'scan-data-missing' },
    });

    const res = await post({ field: 'raisonSociale', value: 'SARL Les Flots Bleus' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({ pdfs: { kind: 'scan-data-missing' } });
  });

  it('answers 404 for an unknown audit without touching manual fields', async () => {
    vi.mocked(getAuditRuntimeFields).mockResolvedValue(null);
    const res = await post({ field: 'nomCommercial', value: 'Les Flots Bleus' });
    expect(res.statusCode).toBe(404);
    expect(setAuditManualFields).not.toHaveBeenCalled();
  });
});
