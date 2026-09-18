/**
 * Store-layer proofs for the Plan 058 report-quality seams
 * (report-quality.ts + schemas/report-quality.schema.ts): lease exclusivity
 * and epoch takeover, run lineage state machine, model-call provenance
 * round-trip, private quality-approved bundles, exact operator approval, and
 * the atomic bilingual active-bundle pointer.
 *
 * The activation suite needs multi-document transactions, which a standalone
 * mongod cannot serve; it skips (like the whole file skips without Mongo)
 * until the test database runs as a replica set.
 */

import { createHash, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Schema, type Connection } from 'mongoose';
import type { ReportQualityModelCall, ReviewIssue, Sha256Digest } from '@odysseus/core';
import {
  acquireReportQualityLease,
  approveExactReportBundle,
  assertReportQualityLease,
  atomicallyActivateReportBundle,
  getActiveReportBundle,
  getReportBundleByDigest,
  recordQualityApprovedBundle,
  releaseReportQualityLease,
  renewReportQualityLease,
  startReportQualityRun,
  transitionReportQualityRun,
  ReportQualityLeaseConflictError,
  StaleReportQualityRunError,
} from './report-quality.js';
import {
  createActiveReportBundleModel,
  createReportQualityLeaseModel,
  createReportQualityRunModel,
} from './schemas/report-quality.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

/** Transactions (atomic activation) need a replica set; standalone mongod,
 *  including the current docker-compose/CI mongo-test service, refuses them. */
async function probeTransactionSupport(conn: Connection): Promise<boolean> {
  const probeModel = conn.model(
    'ReportQualityTransactionProbe',
    new Schema({ v: { type: String, required: true } }),
    'reportQualityTransactionProbes',
  );
  const session = await conn.startSession();
  try {
    await session.withTransaction(async () => {
      await probeModel.create([{ v: 'probe' }], { session });
    });
    return true;
  } catch {
    return false;
  } finally {
    await session.endSession();
  }
}

const transactionsSupported = mongoAvailable ? await probeTransactionSupport(connection!) : false;

afterAll(async () => {
  if (connection) await connection.close();
});

const sha = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}` as Sha256Digest;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const uniqueAuditId = (scope: string) => `${scope}-${randomUUID()}`;

interface SeededBundle {
  bundleId: string;
  bundleDigest: Sha256Digest;
  inputSnapshotDigest: Sha256Digest;
  approvedEvidenceDigest: Sha256Digest;
  fr: { pdfDigest: Sha256Digest; privateObjectKey: string; pageCount: number };
  en: { pdfDigest: Sha256Digest; privateObjectKey: string; pageCount: number };
}

async function seedQualityApprovedBundle(
  conn: Connection,
  seed: {
    auditId: string;
    qualityRunId: string;
    epoch: number;
    evidenceApprovalMode?: 'system' | 'operator' | 'legacy-adapter';
  },
): Promise<SeededBundle> {
  const bundleId = randomUUID();
  const seeded: SeededBundle = {
    bundleId,
    bundleDigest: sha(`bundle:${bundleId}`),
    inputSnapshotDigest: sha(`snapshot:${bundleId}`),
    approvedEvidenceDigest: sha(`evidence:${bundleId}`),
    fr: {
      pdfDigest: sha(`fr-pdf:${bundleId}`),
      privateObjectKey: `private/reports/${seed.auditId}/${bundleId}/fr.pdf`,
      pageCount: 12,
    },
    en: {
      pdfDigest: sha(`en-pdf:${bundleId}`),
      privateObjectKey: `private/reports/${seed.auditId}/${bundleId}/en.pdf`,
      pageCount: 11,
    },
  };
  await recordQualityApprovedBundle(conn, {
    bundleId,
    qualityRunId: seed.qualityRunId,
    auditId: seed.auditId,
    epoch: seed.epoch,
    bundleDigest: seeded.bundleDigest,
    inputSnapshotDigest: seeded.inputSnapshotDigest,
    approvedEvidenceDigest: seeded.approvedEvidenceDigest,
    evidenceApprovalMode: seed.evidenceApprovalMode ?? 'operator',
    fr: seeded.fr,
    en: seeded.en,
  });
  return seeded;
}

describe.skipIf(!mongoAvailable)('report quality store', () => {
  describe('lease', () => {
    it('acquiring a live lease twice for one audit conflicts with ReportQualityLeaseConflictError', async () => {
      const auditId = uniqueAuditId('lease-exclusive');
      const first = await acquireReportQualityLease(connection!, auditId);
      expect(first.epoch).toBe(1);
      expect(first.tokenHash).toBe(sha(first.token));

      await expect(acquireReportQualityLease(connection!, auditId)).rejects.toThrow(
        ReportQualityLeaseConflictError,
      );

      const rows = await createReportQualityLeaseModel(connection!).find({ auditId }).lean();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.qualityRunId).toBe(first.qualityRunId);
    });

    it('renewing the lease extends its database expiry without changing the token or epoch', async () => {
      const auditId = uniqueAuditId('lease-renew');
      const lease = await acquireReportQualityLease(connection!, auditId);
      const renewed = await renewReportQualityLease(connection!, auditId, lease, 45 * 60 * 1000);

      expect(renewed.qualityRunId).toBe(lease.qualityRunId);
      expect(renewed.token).toBe(lease.token);
      expect(renewed.tokenHash).toBe(lease.tokenHash);
      expect(renewed.epoch).toBe(lease.epoch);
      expect(renewed.expiresAt.getTime()).toBeGreaterThan(lease.expiresAt.getTime());

      const row = await createReportQualityLeaseModel(connection!).findOne({ auditId }).lean();
      expect(row?.leaseExpiresAt.getTime()).toBe(renewed.expiresAt.getTime());
      await expect(
        assertReportQualityLease(connection!, auditId, renewed),
      ).resolves.toBeUndefined();
    });

    it('releasing the lease allows immediate re-acquisition with a fresh token', async () => {
      const auditId = uniqueAuditId('lease-release');
      const first = await acquireReportQualityLease(connection!, auditId);
      await releaseReportQualityLease(connection!, auditId, first);

      const rowsAfterRelease = await createReportQualityLeaseModel(connection!)
        .find({ auditId })
        .lean();
      expect(rowsAfterRelease).toHaveLength(0);

      // No expiry wait is needed: a released audit is immediately leasable.
      const second = await acquireReportQualityLease(connection!, auditId);
      expect(second.qualityRunId).not.toBe(first.qualityRunId);
      expect(second.token).not.toBe(first.token);
      await expect(assertReportQualityLease(connection!, auditId, second)).resolves.toBeUndefined();
    });

    it('an expired lease is taken over with a new token and a monotonic epoch bump', async () => {
      const auditId = uniqueAuditId('lease-takeover');
      const expired = await acquireReportQualityLease(connection!, auditId, 20);
      await sleep(80);

      const takeover = await acquireReportQualityLease(connection!, auditId);
      expect(takeover.epoch).toBe(expired.epoch + 1);
      expect(takeover.qualityRunId).not.toBe(expired.qualityRunId);
      expect(takeover.token).not.toBe(expired.token);

      await expect(assertReportQualityLease(connection!, auditId, expired)).rejects.toThrow(
        StaleReportQualityRunError,
      );
    });

    it('asserting a lease with a wrong token, wrong epoch, or after release throws StaleReportQualityRunError', async () => {
      const auditId = uniqueAuditId('lease-assert');
      const lease = await acquireReportQualityLease(connection!, auditId);

      await expect(
        assertReportQualityLease(connection!, auditId, {
          ...lease,
          tokenHash: sha(`forged:${lease.token}`),
        }),
      ).rejects.toThrow(StaleReportQualityRunError);
      await expect(
        assertReportQualityLease(connection!, auditId, { ...lease, epoch: lease.epoch + 5 }),
      ).rejects.toThrow(StaleReportQualityRunError);

      await releaseReportQualityLease(connection!, auditId, lease);
      await expect(assertReportQualityLease(connection!, auditId, lease)).rejects.toThrow(
        StaleReportQualityRunError,
      );
    });
  });

  describe('run lineage', () => {
    it('starting a report quality run persists lineage bound to the lease epoch and token hash', async () => {
      const auditId = uniqueAuditId('lineage-start');
      const lease = await acquireReportQualityLease(connection!, auditId);
      await startReportQualityRun(connection!, auditId, lease);

      const run = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: lease.qualityRunId })
        .lean();
      expect(run).toMatchObject({
        qualityRunId: lease.qualityRunId,
        auditId,
        epoch: lease.epoch,
        leaseTokenHash: lease.tokenHash,
        state: 'running',
      });
      expect(run?.modelCalls).toEqual([]);
      expect(run?.candidateDigests).toEqual([]);
    });

    it('transitions along the Plan 058 state machine record state, input snapshot digests, and appended digests', async () => {
      const auditId = uniqueAuditId('lineage-machine');
      const lease = await acquireReportQualityLease(connection!, auditId);
      await startReportQualityRun(connection!, auditId, lease);

      const inputSnapshotDigest = sha(`snapshot:${auditId}`);
      const approvedEvidenceDigest = sha(`evidence:${auditId}`);
      const frDigest = sha(`fr:${auditId}`);
      const enDigest = sha(`en:${auditId}`);
      const bundleDigest = sha(`bundle:${auditId}`);

      await transitionReportQualityRun(connection!, auditId, lease, 'running', {
        inputSnapshotDigest,
        approvedEvidenceDigest,
      });
      await transitionReportQualityRun(connection!, auditId, lease, 'content-clean');
      await transitionReportQualityRun(connection!, auditId, lease, 'parity-clean');

      const midway = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: lease.qualityRunId })
        .lean();
      expect(midway?.state).toBe('parity-clean');
      expect(midway?.inputSnapshotDigest).toBe(inputSnapshotDigest);
      expect(midway?.approvedEvidenceDigest).toBe(approvedEvidenceDigest);

      await transitionReportQualityRun(connection!, auditId, lease, 'fr-candidate-clean', {
        candidateDigest: frDigest,
      });
      await transitionReportQualityRun(connection!, auditId, lease, 'en-candidate-clean', {
        candidateDigest: enDigest,
      });
      await transitionReportQualityRun(connection!, auditId, lease, 'bundle-final-review');
      await transitionReportQualityRun(connection!, auditId, lease, 'quality-approved', {
        candidateDigest: bundleDigest,
      });
      await transitionReportQualityRun(connection!, auditId, lease, 'awaiting-operator-approval');

      const run = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: lease.qualityRunId })
        .lean();
      expect(run?.state).toBe('awaiting-operator-approval');
      expect(run?.candidateDigests).toEqual([frDigest, enDigest, bundleDigest]);
      expect(run?.modelCalls).toEqual([]);
    });

    it('a transition outside the Plan 058 state machine is refused and leaves the run state unchanged', async () => {
      const auditId = uniqueAuditId('lineage-refusal');
      const lease = await acquireReportQualityLease(connection!, auditId);
      await startReportQualityRun(connection!, auditId, lease);

      await expect(
        transitionReportQualityRun(connection!, auditId, lease, 'promoted'),
      ).rejects.toThrow(/from 'running' to 'promoted' is not allowed/);
      await expect(
        transitionReportQualityRun(connection!, auditId, lease, 'quality-approved'),
      ).rejects.toThrow(/not allowed/);

      const run = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: lease.qualityRunId })
        .lean();
      expect(run?.state).toBe('running');

      // The refusal was about the transition, not a blanket lock: legal
      // transitions from the same state still work.
      await transitionReportQualityRun(connection!, auditId, lease, 'content-clean');
      const updated = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: lease.qualityRunId })
        .lean();
      expect(updated?.state).toBe('content-clean');
    });

    it('a transition from a stale epoch lease is refused with StaleReportQualityRunError', async () => {
      const auditId = uniqueAuditId('lineage-stale-epoch');
      const staleLease = await acquireReportQualityLease(connection!, auditId, 20);
      await startReportQualityRun(connection!, auditId, staleLease);
      await sleep(80);
      const currentLease = await acquireReportQualityLease(connection!, auditId);
      expect(currentLease.epoch).toBe(staleLease.epoch + 1);

      await expect(
        transitionReportQualityRun(connection!, auditId, staleLease, 'content-clean'),
      ).rejects.toThrow(StaleReportQualityRunError);

      const run = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: staleLease.qualityRunId })
        .lean();
      expect(run?.state).toBe('running');

      // The takeover lease minted a fresh run id, so the superseded run's
      // lineage is not theirs either: the new worker must start its own run
      // before it can transition anything.
      await expect(
        transitionReportQualityRun(connection!, auditId, currentLease, 'content-clean'),
      ).rejects.toThrow(StaleReportQualityRunError);
      await startReportQualityRun(connection!, auditId, currentLease);
      await transitionReportQualityRun(connection!, auditId, currentLease, 'content-clean');
    });

    it('adjudicated review issues append to the run lineage under the closed ReviewIssue contract', async () => {
      const auditId = uniqueAuditId('lineage-review-issues');
      const lease = await acquireReportQualityLease(connection!, auditId);
      await startReportQualityRun(connection!, auditId, lease);
      const baseIssue: ReviewIssue = {
        issueId: 'iss-1',
        kind: 'preference',
        severity: 'minor',
        target: 'fr.analysis.executiveSummary',
        domain: 'editorial',
        supportingRefs: [],
        reason: 'register drift',
        repairRoute: 'patch-prose',
        status: 'rejected',
        sourceRole: 'issue-adjudicator',
        artifactDigest: `sha256:${'c'.repeat(64)}`,
      };
      await transitionReportQualityRun(connection!, auditId, lease, 'content-clean', {
        reviewIssues: [baseIssue],
      });
      await transitionReportQualityRun(connection!, auditId, lease, 'content-clean', {
        reviewIssues: [{ ...baseIssue, issueId: 'iss-2', status: 'accepted' }],
      });

      const run = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: lease.qualityRunId })
        .lean();
      expect(run?.issues.map((issue) => issue.issueId)).toEqual(['iss-1', 'iss-2']);
      expect(run?.issues[0]).toMatchObject({
        kind: 'preference',
        severity: 'minor',
        status: 'rejected',
        sourceRole: 'issue-adjudicator',
        repairRoute: 'patch-prose',
      });
      expect(run?.issues[1]?.status).toBe('accepted');
    });
  });

  describe('model-call provenance', () => {
    it('model call provenance round-trips role, profile digest, requested/resolved model, provider fingerprint, reasoning effort, and prompt/schema digests and versions through the run lineage', async () => {
      // The core ReportQualityModelCall contract gains promptVersion and
      // schemaVersion alongside the profile registry work; typing the
      // fixture through an intersection keeps this suite valid both before
      // and after that core-type change lands.
      type ModelCallWithVersions = ReportQualityModelCall & {
        promptVersion?: string;
        schemaVersion?: string;
      };
      const frWriterCall: ModelCallWithVersions = {
        role: 'writer-fr',
        profileId: 'report-quality-writer-fr',
        profileDigest: sha('profile:writer-fr:gpt-5.6-sol:high'),
        requestedModel: 'gpt-5.6-sol',
        resolvedModel: 'gpt-5.6-sol-2026-08-15',
        providerFingerprint: 'openai#2026-09-01',
        reasoningEffort: 'high',
        promptDigest: sha('prompt:writer-fr:v1'),
        schemaDigest: sha('schema:quality-writer:v1'),
        promptVersion: 'writer-fr@1',
        schemaVersion: 'quality-writer@1',
      };
      const arbiterCall: ModelCallWithVersions = {
        role: 'final-document-arbiter',
        profileId: 'report-quality-final-document-arbiter',
        profileDigest: sha('profile:final-document-arbiter:gpt-5.6-sol:xhigh'),
        requestedModel: 'gpt-5.6-sol',
        resolvedModel: 'gpt-5.6-sol-2026-08-15',
        reasoningEffort: 'xhigh',
        promptDigest: sha('prompt:final-document-arbiter:v1'),
        schemaDigest: sha('schema:final-arbiter:v1'),
        promptVersion: 'final-document-arbiter@1',
        schemaVersion: 'final-arbiter@1',
      };

      const auditId = uniqueAuditId('provenance');
      const lease = await acquireReportQualityLease(connection!, auditId);
      await startReportQualityRun(connection!, auditId, lease);
      await transitionReportQualityRun(connection!, auditId, lease, 'running', {
        modelCall: frWriterCall,
      });
      await transitionReportQualityRun(connection!, auditId, lease, 'running', {
        modelCall: arbiterCall,
      });

      const run = await createReportQualityRunModel(connection!)
        .findOne({ qualityRunId: lease.qualityRunId })
        .lean();
      expect(run?.modelCalls).toEqual([frWriterCall, arbiterCall]);
      expect(run?.modelCalls[0]).toMatchObject({
        role: 'writer-fr',
        profileId: 'report-quality-writer-fr',
        profileDigest: frWriterCall.profileDigest,
        requestedModel: 'gpt-5.6-sol',
        resolvedModel: 'gpt-5.6-sol-2026-08-15',
        providerFingerprint: 'openai#2026-09-01',
        reasoningEffort: 'high',
        promptDigest: frWriterCall.promptDigest,
        schemaDigest: frWriterCall.schemaDigest,
        promptVersion: 'writer-fr@1',
        schemaVersion: 'quality-writer@1',
      });
    });
  });

  describe('quality-approved bundles', () => {
    it('recording a quality-approved bundle persists private FR/EN candidates retrievable only by the exact bundle digest', async () => {
      const auditId = uniqueAuditId('bundle-record');
      const seeded = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId: randomUUID(),
        epoch: 1,
      });

      const row = await getReportBundleByDigest(connection!, auditId, seeded.bundleDigest);
      expect(row).not.toBeNull();
      expect(row).toMatchObject({
        bundleId: seeded.bundleId,
        auditId,
        bundleDigest: seeded.bundleDigest,
        inputSnapshotDigest: seeded.inputSnapshotDigest,
        approvedEvidenceDigest: seeded.approvedEvidenceDigest,
        evidenceApprovalMode: 'operator',
        state: 'awaiting-operator-approval',
      });
      expect(row?.fr).toEqual(seeded.fr);
      expect(row?.en).toEqual(seeded.en);

      expect(
        await getReportBundleByDigest(connection!, auditId, sha(`wrong:${auditId}`)),
      ).toBeNull();
    });

    it('approving the exact bundle digest flips the awaiting-operator bundle to operator-approved', async () => {
      const auditId = uniqueAuditId('bundle-approve');
      const qualityRunId = randomUUID();
      const seeded = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId,
        epoch: 1,
      });

      const approved = await approveExactReportBundle(connection!, {
        auditId,
        qualityRunId,
        epoch: 1,
        bundleDigest: seeded.bundleDigest,
      });
      expect(approved.state).toBe('operator-approved');
      expect(approved.operatorApprovedAt).toBeInstanceOf(Date);
      expect(approved.bundleDigest).toBe(seeded.bundleDigest);

      const row = await getReportBundleByDigest(connection!, auditId, seeded.bundleDigest);
      expect(row?.state).toBe('operator-approved');
      expect(row?.operatorApprovedAt).toBeInstanceOf(Date);
    });

    it('operator approval refuses a mismatched digest, a wrong quality run or epoch, and an already-decided bundle', async () => {
      const auditId = uniqueAuditId('bundle-approve-refusal');
      const seededA = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId: randomUUID(),
        epoch: 1,
      });
      const qualityRunIdB = randomUUID();
      const seededB = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId: qualityRunIdB,
        epoch: 2,
      });

      // Mismatched digest, and the exact digest under the wrong run/epoch.
      await expect(
        approveExactReportBundle(connection!, {
          auditId,
          qualityRunId: qualityRunIdB,
          epoch: 2,
          bundleDigest: seededA.bundleDigest,
        }),
      ).rejects.toThrow(/not current/);
      await expect(
        approveExactReportBundle(connection!, {
          auditId,
          qualityRunId: qualityRunIdB,
          epoch: 3,
          bundleDigest: seededB.bundleDigest,
        }),
      ).rejects.toThrow(/not current/);

      const approved = await approveExactReportBundle(connection!, {
        auditId,
        qualityRunId: qualityRunIdB,
        epoch: 2,
        bundleDigest: seededB.bundleDigest,
      });
      expect(approved.state).toBe('operator-approved');

      // Already decided: a second approval of the same exact bundle refuses.
      await expect(
        approveExactReportBundle(connection!, {
          auditId,
          qualityRunId: qualityRunIdB,
          epoch: 2,
          bundleDigest: seededB.bundleDigest,
        }),
      ).rejects.toThrow(/not current/);

      const stillAwaiting = await getReportBundleByDigest(
        connection!,
        auditId,
        seededA.bundleDigest,
      );
      expect(stillAwaiting?.state).toBe('awaiting-operator-approval');
    });
  });

  describe.skipIf(!transactionsSupported)('atomic activation', () => {
    it('atomic activation promotes FR and EN together under a single active pointer', async () => {
      const auditId = uniqueAuditId('activate-first');
      const qualityRunId = randomUUID();
      const seeded = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId,
        epoch: 1,
      });
      const approved = await approveExactReportBundle(connection!, {
        auditId,
        qualityRunId,
        epoch: 1,
        bundleDigest: seeded.bundleDigest,
      });

      const frObjectKey = `public/reports/${auditId}/fr.pdf`;
      const enObjectKey = `public/reports/${auditId}/en.pdf`;
      const active = await atomicallyActivateReportBundle(connection!, {
        auditId,
        bundle: approved,
        frObjectKey,
        enObjectKey,
      });

      expect(active.revision).toBe(1);
      expect(active.auditId).toBe(auditId);
      expect(active.bundleId).toBe(seeded.bundleId);
      expect(active.qualityRunId).toBe(qualityRunId);
      expect(active.bundleDigest).toBe(seeded.bundleDigest);
      expect(active.activatedAt).toBeInstanceOf(Date);
      expect(active.fr).toEqual({ pdfDigest: seeded.fr.pdfDigest, objectKey: frObjectKey });
      expect(active.en).toEqual({ pdfDigest: seeded.en.pdfDigest, objectKey: enObjectKey });

      const stored = await getActiveReportBundle(connection!, auditId);
      expect(stored?.bundleDigest).toBe(seeded.bundleDigest);
      expect(stored?.fr.pdfDigest).toBe(seeded.fr.pdfDigest);
      expect(stored?.en.pdfDigest).toBe(seeded.en.pdfDigest);

      const promotedBundle = await getReportBundleByDigest(
        connection!,
        auditId,
        seeded.bundleDigest,
      );
      expect(promotedBundle?.state).toBe('promoted');
      expect(promotedBundle?.promotedAt).toBeInstanceOf(Date);
      expect(promotedBundle?.fr.objectKey).toBe(frObjectKey);
      expect(promotedBundle?.en.objectKey).toBe(enObjectKey);
    });

    it('re-activating a newer bundle increments the active pointer revision monotonically and swaps both languages together', async () => {
      const auditId = uniqueAuditId('activate-second');
      const run1 = randomUUID();
      const seeded1 = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId: run1,
        epoch: 1,
      });
      const approved1 = await approveExactReportBundle(connection!, {
        auditId,
        qualityRunId: run1,
        epoch: 1,
        bundleDigest: seeded1.bundleDigest,
      });
      const first = await atomicallyActivateReportBundle(connection!, {
        auditId,
        bundle: approved1,
        frObjectKey: `public/reports/${auditId}/rev1/fr.pdf`,
        enObjectKey: `public/reports/${auditId}/rev1/en.pdf`,
      });
      expect(first.revision).toBe(1);

      const run2 = randomUUID();
      const seeded2 = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId: run2,
        epoch: 2,
      });
      const approved2 = await approveExactReportBundle(connection!, {
        auditId,
        qualityRunId: run2,
        epoch: 2,
        bundleDigest: seeded2.bundleDigest,
      });
      const frObjectKey = `public/reports/${auditId}/rev2/fr.pdf`;
      const enObjectKey = `public/reports/${auditId}/rev2/en.pdf`;
      const second = await atomicallyActivateReportBundle(connection!, {
        auditId,
        bundle: approved2,
        frObjectKey,
        enObjectKey,
      });

      expect(second.revision).toBe(first.revision + 1);

      // One pointer, both languages from the newest bundle, nothing left
      // over from revision 1.
      const pointer = await getActiveReportBundle(connection!, auditId);
      expect(pointer?.revision).toBe(2);
      expect(pointer?.bundleId).toBe(seeded2.bundleId);
      expect(pointer?.bundleDigest).toBe(seeded2.bundleDigest);
      expect(pointer?.epoch).toBe(2);
      expect(pointer?.fr).toEqual({ pdfDigest: seeded2.fr.pdfDigest, objectKey: frObjectKey });
      expect(pointer?.en).toEqual({ pdfDigest: seeded2.en.pdfDigest, objectKey: enObjectKey });

      const promotedRows = await connection!
        .collection('reportBundles')
        .find({ auditId, state: 'promoted' })
        .toArray();
      expect(promotedRows.map((row) => row.bundleDigest).sort()).toEqual(
        [seeded1.bundleDigest, seeded2.bundleDigest].sort(),
      );
    });

    it('a failed half-promotion rolls back so the active pointer never references a mix of bundle revisions', async () => {
      const auditId = uniqueAuditId('activate-rollback');
      const run1 = randomUUID();
      const seeded1 = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId: run1,
        epoch: 1,
      });
      const approved1 = await approveExactReportBundle(connection!, {
        auditId,
        qualityRunId: run1,
        epoch: 1,
        bundleDigest: seeded1.bundleDigest,
      });
      await atomicallyActivateReportBundle(connection!, {
        auditId,
        bundle: approved1,
        frObjectKey: `public/reports/${auditId}/rev1/fr.pdf`,
        enObjectKey: `public/reports/${auditId}/rev1/en.pdf`,
      });

      // Bundle 2 is recorded but NOT operator-approved: promoting it would
      // move the pointer and then lose the approved-state CAS, and the
      // transaction must roll the pointer back to revision 1 instead of
      // stranding a half-promoted FR/EN mix.
      const seeded2 = await seedQualityApprovedBundle(connection!, {
        auditId,
        qualityRunId: randomUUID(),
        epoch: 2,
      });
      const awaitingBundle = (await getReportBundleByDigest(
        connection!,
        auditId,
        seeded2.bundleDigest,
      ))!;
      await expect(
        atomicallyActivateReportBundle(connection!, {
          auditId,
          bundle: awaitingBundle,
          frObjectKey: `public/reports/${auditId}/rev2/fr.pdf`,
          enObjectKey: `public/reports/${auditId}/rev2/en.pdf`,
        }),
      ).rejects.toThrow(/lost its approved state/);

      const pointer = await getActiveReportBundle(connection!, auditId);
      expect(pointer?.revision).toBe(1);
      expect(pointer?.bundleDigest).toBe(seeded1.bundleDigest);
      expect(pointer?.fr.pdfDigest).toBe(seeded1.fr.pdfDigest);
      expect(pointer?.en.pdfDigest).toBe(seeded1.en.pdfDigest);

      const refusedBundle = await getReportBundleByDigest(
        connection!,
        auditId,
        seeded2.bundleDigest,
      );
      expect(refusedBundle?.state).toBe('awaiting-operator-approval');
    });
  });
});
