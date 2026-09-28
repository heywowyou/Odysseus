/**
 * Plan 050 closure proof (the archive/restore identity fixture): the
 * operator's real Archive and Restore actions, driven through the HTTP
 * routes against real Mongo, return the exact same prospect with its
 * enrichment, correspondence, event history and directory link. Under the
 * issue #381 amendment the archive also purges the prospect's audits and
 * their files, and this test pins that scope too; under issue #560 a
 * delivered audit is slimmed and kept instead. Docker-gated: it skips
 * cleanly when mongo-test is down.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  addDirectoryEntriesToProspects,
  createAuditModel,
  createDirectoryEntryModel,
  createProspectHubModel,
  createReportModel,
  listArchivedProspectsWithAudits,
  findOutreachThreadByProspect,
  isSuppressed,
  listDirectory,
  listProspectEvents,
  listProspectTodo,
  openOutreachThread,
  upsertDirectoryEntries,
} from '@odysseus/store';
import { buildAuditDir } from '@odysseus/scanner';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import { Router } from '../router.js';
import { registerProspectHubRoutes } from './prospect-hub.js';

// Local files only: this suite must never reach a configured artifact bucket.
vi.mock('../artifacts/configured-artifact-store.js', () => ({
  createConfiguredArtifactStore: () => undefined,
}));

const { available: mongoAvailable, connection } = await probeMongoAvailability(
  scopedMongoTestUri('prospect_archive_integration'),
);

let artifactsRoot: string | undefined;
let previousArtifactsRoot: string | undefined;

beforeAll(async () => {
  if (!mongoAvailable) return;
  artifactsRoot = await fs.mkdtemp(path.join(tmpdir(), 'odysseus-prospect-archive-'));
  previousArtifactsRoot = process.env.ODYSSEUS_ARTIFACTS_ROOT;
  process.env.ODYSSEUS_ARTIFACTS_ROOT = artifactsRoot;
});

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
  if (artifactsRoot !== undefined) await fs.rm(artifactsRoot, { recursive: true, force: true });
  if (previousArtifactsRoot === undefined) delete process.env.ODYSSEUS_ARTIFACTS_ROOT;
  else process.env.ODYSSEUS_ARTIFACTS_ROOT = previousArtifactsRoot;
});

type Method = 'GET' | 'POST' | 'PATCH';

async function call(url: string, method: Method = 'GET', body?: unknown) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers =
    body === undefined
      ? {}
      : { 'content-type': 'application/json', 'content-length': String(payload[0]!.length) };
  const res = {
    statusCode: 200,
    body: undefined as string | undefined,
    setHeader: vi.fn(),
    end: vi.fn(function (this: { body: string | undefined }, chunk?: string) {
      this.body = chunk;
    }),
  } as unknown as ServerResponse & { statusCode: number; body: string | undefined };
  const router = new Router();
  registerProspectHubRoutes(router, connection!, { isJobInFlight: () => false });
  await router.handle(req, res);
  return { statusCode: res.statusCode, body: JSON.parse(res.body ?? '{}') as unknown };
}

describe.skipIf(!mongoAvailable)('prospect archive and restore through the routes', () => {
  // A fresh scoped database builds every touched collection's indexes on
  // first use; under the full suite's Mongo contention that DDL alone can
  // pass the default 20 s, as it did for schema-indexes.test.ts.
  it(
    'returns the exact enriched prospect, its history and directory link, and purges only its audits',
    { timeout: 60_000 },
    async () => {
      const directoryId = `dir-${randomUUID()}`;
      const domain = 'hotel-identite.example';
      const now = new Date('2026-09-01T00:00:00.000Z');
      await upsertDirectoryEntries(connection!, [
        {
          directoryId,
          sector: 'hotel',
          name: 'Hôtel Identité',
          websiteUrl: `https://${domain}/`,
          registrableDomain: domain,
          websiteKind: 'own',
          stars: 3,
          sourceRefs: [{ source: 'atout-france', sourceId: directoryId }],
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const [created] = await addDirectoryEntriesToProspects(connection!, [directoryId]);
      const prospectId = created!.prospectId;

      // Operator enrichment through the ordinary edit route.
      const edited = await call(`/api/prospects/${prospectId}`, 'PATCH', {
        siren: '552100554',
        legalName: 'SAS Identité Hôtelière',
        tradingName: 'Hôtel du Port',
        phone: '+33 5 46 00 00 00',
        emails: [{ address: `direction@${domain}`, origin: 'operator' }],
        notes: 'Préfère un appel le matin.',
      });
      expect(edited.statusCode).toBe(200);
      await openOutreachThread(connection!, {
        prospectId,
        previewId: randomUUID(),
        domain,
        roleAddress: `contact@${domain}`,
        language: 'fr',
        openedAt: now,
        spacing: { touch2AfterDays: 4, touch3AfterDays: 10, replyWindowDays: 21 },
        campaignVersion: 'test-campaign',
      });

      // One stored audit with a local artifact folder.
      const auditId = randomUUID();
      const startedAt = new Date('2026-09-02T08:00:00.000Z');
      await createAuditModel(connection!).collection.insertOne({
        auditId,
        prospectId,
        kind: 'audit',
        siteUrl: `https://${domain}/`,
        startedAt,
      });
      const auditDir = buildAuditDir(artifactsRoot!, domain, startedAt);
      await fs.mkdir(auditDir, { recursive: true });
      await fs.writeFile(path.join(auditDir, 'manifest.json'), '{}');

      // Issue #560: a delivered audit (finalized report) with captured pages.
      const deliveredId = randomUUID();
      const deliveredAt = new Date('2026-08-20T08:00:00.000Z');
      await createAuditModel(connection!).collection.insertOne({
        auditId: deliveredId,
        prospectId,
        kind: 'audit',
        siteUrl: `https://${domain}/`,
        startedAt: deliveredAt,
      });
      await createReportModel(connection!).collection.insertOne({
        reportId: randomUUID(),
        auditId: deliveredId,
        origin: 'finalized',
      });
      const deliveredDir = buildAuditDir(artifactsRoot!, domain, deliveredAt);
      await fs.mkdir(path.join(deliveredDir, 'pages'), { recursive: true });
      await fs.writeFile(path.join(deliveredDir, 'pages', 'home.html'), '<html></html>');
      await fs.writeFile(path.join(deliveredDir, 'manifest.json'), '{}');
      await fs.writeFile(path.join(deliveredDir, 'report.pdf'), 'pdf');

      const rawProspect = () =>
        createProspectHubModel(connection!).collection.findOne({ prospectId });
      const stable = (doc: Record<string, unknown> | null) => {
        const { updatedAt: _u, lastActivityAt: _l, archivedAt: _a, ...rest } = doc!;
        return rest;
      };
      const before = await rawProspect();
      const threadBefore = await findOutreachThreadByProspect(connection!, prospectId);
      const eventsBefore = await listProspectEvents(connection!, prospectId);

      const archived = await call(`/api/prospects/${prospectId}/archive`, 'POST');
      expect(archived.statusCode).toBe(200);
      expect(archived.body).toMatchObject({ changed: true, purged: { audits: 1, auditsKept: 1 } });

      // Archived: out of active work, still the same record, still linked.
      expect(stable(await rawProspect())).toStrictEqual(stable(before));
      expect((await listProspectTodo(connection!)).map((row) => row.prospectId)).not.toContain(
        prospectId,
      );
      const archivedRow = (await listDirectory(connection!, { q: 'Hôtel Identité' })).rows.find(
        (row) => row.directoryId === directoryId,
      );
      expect(archivedRow?.prospectState).toBe('archived');
      expect(await addDirectoryEntriesToProspects(connection!, [directoryId])).toEqual([]);
      // Archive is not an objection: it adds no suppression (section 14).
      expect(await isSuppressed(connection!, domain, `direction@${domain}`)).toBe(false);
      // Issue #381: the audit and its files are gone.
      expect(await createAuditModel(connection!).countDocuments({ auditId })).toBe(0);
      await expect(fs.access(auditDir)).rejects.toThrow();
      // Issue #560: the delivered audit stays, slimmed, and is not pending.
      const delivered = await createAuditModel(connection!)
        .findOne({ auditId: deliveredId })
        .lean();
      expect(delivered?.retention?.slimmedAt).toBeInstanceOf(Date);
      await expect(fs.access(path.join(deliveredDir, 'pages'))).rejects.toThrow();
      await expect(fs.access(path.join(deliveredDir, 'report.pdf'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(deliveredDir, 'manifest.json'))).resolves.toBeUndefined();
      expect(
        (await listArchivedProspectsWithAudits(connection!)).map((row) => row.prospectId),
      ).not.toContain(prospectId);
      const again = await call(`/api/prospects/${prospectId}/archive`, 'POST');
      expect(again.body).toMatchObject({ purged: { audits: 0, auditsKept: 1 } });

      const restored = await call(`/api/prospects/${prospectId}/restore`, 'POST');
      expect(restored.statusCode).toBe(200);
      expect(restored.body).toMatchObject({ changed: true, prospect: { prospectId } });

      const after = await rawProspect();
      expect(after).not.toHaveProperty('archivedAt');
      expect(stable(after)).toStrictEqual(stable(before));
      expect(after).toMatchObject({
        prospectId,
        siren: '552100554',
        legalName: 'SAS Identité Hôtelière',
        tradingName: 'Hôtel du Port',
        notes: 'Préfère un appel le matin.',
        directoryRef: before!['directoryRef'],
      });
      expect(await findOutreachThreadByProspect(connection!, prospectId)).toStrictEqual(
        threadBefore,
      );
      const entry = await createDirectoryEntryModel(connection!).findOne({ directoryId }).lean();
      expect(entry?.prospectId).toBe(prospectId);
      const eventsAfter = await listProspectEvents(connection!, prospectId);
      const beforeIds = new Set(eventsBefore.map((event) => event.eventId));
      expect(eventsAfter.filter((event) => beforeIds.has(event.eventId))).toStrictEqual(
        eventsBefore,
      );
      expect(
        eventsAfter
          .filter((event) => !beforeIds.has(event.eventId))
          .map((event) => event.type)
          .sort(),
      ).toEqual(['prospect-archived', 'prospect-restored']);
    },
  );
});
