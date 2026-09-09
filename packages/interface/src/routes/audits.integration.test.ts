/**
 * Issue #155: the one suite that executes the approve-then-deliver route
 * chain against real Mongoose documents. Every other interface route suite
 * mocks @odysseus/store wholesale, so the route-to-store runtime contract
 * (lean document shapes, dates coming back as Date, argument construction)
 * is otherwise enforced only by the TypeScript compiler. Like the store
 * package's own suites, this file is docker-gated and skips cleanly when
 * mongo-test is down.
 */

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FINDINGS_SCHEMA_VERSION,
  NORMALIZATION_FINGERPRINT,
  type AuditManifest,
  type FindingsProvenance,
} from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION } from '@odysseus/report';
import {
  createReportModel,
  deleteAuditCascade,
  getLatestReport,
  getLatestReportApproval,
  persistAnalysis,
  persistAudit,
  persistReport,
  type AnalysisDocumentFields,
  type ReportDocumentFields,
} from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import { Router } from '../router.js';
import { registerAuditRoutes } from './audits.js';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability(
  scopedMongoTestUri('audits_route_integration'),
);

/** Same provenance stamp on the audit manifest, both analyses, and both
 *  reports: equal provenance keys are what makes the pair complete and
 *  compatible, and what makes verifyFreshPair accept the reports as fresh. */
const sharedProvenance: FindingsProvenance = {
  findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
  normalizationFingerprint: NORMALIZATION_FINGERPRINT,
  findingsDigest: `sha256:${'a'.repeat(64)}`,
};

const STARTED_AT = '2026-08-02T00:00:00.000Z';
const GENERATED_AT = '2026-08-02T00:04:00.000Z';

function buildManifest(overrides: Partial<AuditManifest> = {}): AuditManifest {
  return {
    auditId: 'audits-route-integration',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: STARTED_AT,
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30000,
      lighthouseTimeoutMs: 60000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
    ...overrides,
  };
}

function buildAnalysisFields(auditId: string, language: 'fr' | 'en'): AnalysisDocumentFields {
  return {
    analysisId: `analysis-${language}-${auditId}`,
    auditId,
    findingsProvenance: sharedProvenance,
    language,
    model: 'integration-test-model',
    temperature: 0.2,
    generatedAt: new Date(GENERATED_AT),
    executiveSummary: 'Integration fixture summary.',
    overallRisk: 'medium',
    themes: [],
    quickWins: [],
    notes: 'Integration fixture.',
  };
}

function buildReportFields(
  auditId: string,
  language: 'fr' | 'en',
  pdfDigest: string,
): ReportDocumentFields {
  return {
    reportId: `report-${language}-${auditId}`,
    auditId,
    analysisId: `analysis-${language}-${auditId}`,
    findingsProvenance: sharedProvenance,
    rendererVersion: REPORT_TEMPLATE_VERSION,
    rendererBuild: 'integration-test',
    pdfDigest,
    language,
    reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    analysisGeneratedAt: new Date(GENERATED_AT),
    fileRef: `reports/${language}.pdf`,
    generatedAt: new Date(GENERATED_AT),
  };
}

interface SeededChain {
  auditId: string;
  reportFrId: string;
  pdf: Buffer;
  pdfDigest: string;
}

const seededAuditIds: string[] = [];

/** Seeds one full chain (audit, bilingual analyses, bilingual reports, PDF
 *  bytes on disk) under a fresh unique auditId, without persisting an
 *  approval: the approve route under test writes that itself. */
async function seedApprovedChain(): Promise<SeededChain> {
  const auditId = `route-integration-${randomUUID()}`;
  const pdf = Buffer.from(`%PDF-integration-${auditId}`);
  const pdfDigest = `sha256:${createHash('sha256').update(pdf).digest('hex')}`;

  const manifestDefaults = buildManifest();
  const manifest = buildManifest({
    auditId,
    siteUrl: 'https://example.com/',
    findingsProvenance: sharedProvenance,
    crawl: { ...manifestDefaults.crawl, startUrl: 'https://example.com/' },
  });
  await persistAudit(connection!, manifest, []);
  await persistAnalysis(connection!, buildAnalysisFields(auditId, 'fr'));
  await persistAnalysis(connection!, buildAnalysisFields(auditId, 'en'));
  await persistReport(connection!, buildReportFields(auditId, 'fr', pdfDigest));
  await persistReport(connection!, buildReportFields(auditId, 'en', pdfDigest));

  // The routes resolve the audit directory exactly like this per request,
  // so the seeded bytes must land under the same hostname and timestamp
  // segments the manifest produces.
  const hostname = new URL(manifest.siteUrl).hostname;
  const auditDir = buildAuditDir(getArtifactsRoot(), hostname, new Date(manifest.startedAt));
  await fs.mkdir(path.join(auditDir, 'reports'), { recursive: true });
  await fs.writeFile(path.join(auditDir, 'reports', 'fr.pdf'), pdf);
  await fs.writeFile(path.join(auditDir, 'reports', 'en.pdf'), pdf);

  seededAuditIds.push(auditId);
  return { auditId, reportFrId: `report-fr-${auditId}`, pdf, pdfDigest };
}

function fakeReq(url: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = 'GET';
  req.url = url;
  req.headers = {};
  return req;
}

type FakeRes = ServerResponse & { statusCode: number; body: string | Buffer | undefined };

function fakeRes(): FakeRes {
  const res = {
    statusCode: 200,
    body: undefined as string | Buffer | undefined,
    setHeader: vi.fn(),
    end: vi.fn(function (this: { body: string | Buffer | undefined }, chunk?: string | Buffer) {
      this.body = chunk;
    }),
  };
  return res as never;
}

function bypassTransaction(): void {
  // mongo-test is a standalone mongod (docker-compose.yml) and cannot run
  // multi-document transactions; production runs on Atlas, where the real
  // transaction wrapper works. Passthrough keeps the route's re-verify
  // logic while persistReportApproval treats the session as optional.
  (
    connection! as unknown as {
      transaction: (fn: (s?: never) => Promise<unknown>) => Promise<unknown>;
    }
  ).transaction = (fn) => fn(undefined);
}

async function approveViaRoute(auditId: string): Promise<FakeRes> {
  bypassTransaction();
  const router = new Router();
  registerAuditRoutes(router, connection!);
  const req = fakeReq(`/api/audits/${auditId}/approve-reports`);
  req.method = 'POST';
  const res = fakeRes();
  await router.handle(req, res);
  return res;
}

async function getViaRoute(auditId: string, language: string): Promise<FakeRes> {
  const router = new Router();
  registerAuditRoutes(router, connection!);
  const req = fakeReq(`/api/audits/${auditId}/report/${language}`);
  const res = fakeRes();
  await router.handle(req, res);
  return res;
}

let artifactsRoot: string | undefined;
let previousArtifactsRoot: string | undefined;

beforeAll(async () => {
  if (!mongoAvailable) return;
  artifactsRoot = await fs.mkdtemp(path.join(tmpdir(), 'odysseus-audits-route-integration-'));
  previousArtifactsRoot = process.env.ODYSSEUS_ARTIFACTS_ROOT;
  // getArtifactsRoot() reads this per request; an absolute path survives
  // its resolve against the workspace root unchanged.
  process.env.ODYSSEUS_ARTIFACTS_ROOT = artifactsRoot;
});

afterAll(async () => {
  if (!connection) return;
  // Clean up only this suite's documents; never drop the shared database.
  for (const auditId of seededAuditIds) {
    await deleteAuditCascade(connection, auditId);
  }
  await connection.close();
  if (artifactsRoot !== undefined) {
    await fs.rm(artifactsRoot, { recursive: true, force: true });
  }
  if (previousArtifactsRoot === undefined) {
    delete process.env.ODYSSEUS_ARTIFACTS_ROOT;
  } else {
    process.env.ODYSSEUS_ARTIFACTS_ROOT = previousArtifactsRoot;
  }
});

describe.skipIf(!mongoAvailable)('audit routes against real mongo', () => {
  it('approve-reports persists an approval for the verified pair', async () => {
    const chain = await seedApprovedChain();
    const res = await approveViaRoute(chain.auditId);

    expect(res.statusCode).toBe(201);
    const approval = await getLatestReportApproval(connection!, chain.auditId);
    expect(approval).not.toBeNull();
    expect(approval?.fr.reportId).toBe(`report-fr-${chain.auditId}`);
    expect(approval?.fr.pdfDigest).toBe(chain.pdfDigest);
    expect(approval?.en.reportId).toBe(`report-en-${chain.auditId}`);
    expect(approval?.en.pdfDigest).toBe(chain.pdfDigest);
  });

  it('delivery serves the approved PDF with the recorded digest', async () => {
    const chain = await seedApprovedChain();
    const approved = await approveViaRoute(chain.auditId);
    expect(approved.statusCode).toBe(201);

    const res = await getViaRoute(chain.auditId, 'fr');
    expect(res.statusCode).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith('content-type', 'application/pdf');
    expect(res.body).toEqual(chain.pdf);

    const stored = await getLatestReport(connection!, chain.auditId, 'fr');
    expect(stored?.pdfDigest).toBeDefined();
    const servedDigest = `sha256:${createHash('sha256')
      .update(res.body as Buffer)
      .digest('hex')}`;
    expect(servedDigest).toBe(stored?.pdfDigest);
  });

  it('delivery 409s once the stored report no longer matches the approval', async () => {
    const chain = await seedApprovedChain();
    const approved = await approveViaRoute(chain.auditId);
    expect(approved.statusCode).toBe(201);

    await createReportModel(connection!).updateOne(
      { reportId: chain.reportFrId },
      { $set: { pdfDigest: `sha256:${'f'.repeat(64)}` } },
    );

    const res = await getViaRoute(chain.auditId, 'fr');
    // The approval still references the original digest, so this 409 is
    // the approval gate, not the byte-digest gate: a tampered report row
    // can never be served silently.
    expect(res.statusCode).toBe(409);
    expect(res.body).toContain('not been approved');
  });
});
