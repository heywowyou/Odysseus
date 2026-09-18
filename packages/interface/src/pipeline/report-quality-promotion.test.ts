import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sha256Digest } from '@odysseus/core';
import { ReportProfileBenchmarkNotCurrentError } from '@odysseus/llm';
import {
  createReportBundleModel,
  getReportBundleByDigest,
  recordQualityApprovedBundle,
} from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import { InMemoryArtifactStore } from './report-quality-pipeline.fixtures.js';
import { approveAndPromoteReportQualityBundle } from './report-quality-promotion.js';

/**
 * Fail-closed proofs for the production promotion boundary (Plan 058 §6.1).
 *
 * The committed benchmark manifest is `pending` by design, so the real
 * benchmark gate refuses every call; the harness below can bypass only that
 * single gate (`benchmarkGate.bypass`) to prove that the later gates still
 * refuse in the documented order. No test reaches activation: every proof
 * here is a refusal, which is exactly the fail-closed contract.
 *
 * Mongo-backed via the shared Docker test database; the suite skips when it
 * is unreachable (as the store integration suites do).
 */

const benchmarkGate = vi.hoisted(() => ({ bypass: false }));

vi.mock('@odysseus/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/llm')>();
  return {
    ...actual,
    // Only the preflight assertion is interceptable; by default it runs the
    // real implementation, which refuses while the manifest is pending.
    assertProductionProfileBenchmarksCurrent: (
      manifest?: Parameters<typeof actual.assertProductionProfileBenchmarksCurrent>[0],
    ) => {
      if (benchmarkGate.bypass) return;
      actual.assertProductionProfileBenchmarksCurrent(manifest);
    },
  };
});

const { available: mongoAvailable, connection } = await probeMongoAvailability(
  scopedMongoTestUri('report_quality_promotion'),
);

afterAll(async () => {
  if (connection) await connection.close();
});

const sha = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}` as Sha256Digest;

async function seedAwaitingApprovalBundle(
  overrides: { evidenceApprovalMode?: 'system' | 'operator' | 'legacy-adapter' } = {},
) {
  const auditId = `audit-${randomUUID()}`;
  const qualityRunId = `run-${randomUUID()}`;
  const epoch = 1;
  const bundleDigest = sha(`bundle:${qualityRunId}`);
  await recordQualityApprovedBundle(connection!, {
    bundleId: `bundle-${randomUUID()}`,
    qualityRunId,
    auditId,
    epoch,
    bundleDigest,
    inputSnapshotDigest: sha(`snapshot:${qualityRunId}`),
    approvedEvidenceDigest: sha(`evidence:${qualityRunId}`),
    evidenceApprovalMode: overrides.evidenceApprovalMode ?? 'operator',
    fr: {
      pdfDigest: sha(`fr-pdf:${qualityRunId}`),
      privateObjectKey: `private/reports/${qualityRunId}/fr.pdf`,
      pageCount: 2,
    },
    en: {
      pdfDigest: sha(`en-pdf:${qualityRunId}`),
      privateObjectKey: `private/reports/${qualityRunId}/en.pdf`,
      pageCount: 2,
    },
  });
  return { auditId, qualityRunId, epoch, bundleDigest };
}

function promotionInput(seed: {
  auditId: string;
  qualityRunId: string;
  epoch: number;
  bundleDigest: Sha256Digest;
}) {
  return { ...seed };
}

describe.skipIf(!mongoAvailable)('approveAndPromoteReportQualityBundle fail-closed gates', () => {
  describe('production benchmark gate', () => {
    beforeEach(() => {
      benchmarkGate.bypass = false;
    });

    it('refuses promotion with ReportProfileBenchmarkNotCurrentError while any role benchmark approval is not current, before any bundle is looked up', async () => {
      // Nothing is seeded under this digest: if the benchmark gate failed to
      // fire, the next gate would answer with the "not current" refusal
      // instead, so the error type alone proves the ordering.
      const input = {
        auditId: `audit-${randomUUID()}`,
        qualityRunId: `run-${randomUUID()}`,
        epoch: 1,
        bundleDigest: sha('no-such-bundle'),
      };

      const error = await approveAndPromoteReportQualityBundle(
        connection!,
        new InMemoryArtifactStore(),
        input,
      ).then(
        () => null,
        (caught) => caught,
      );

      expect(error).toBeInstanceOf(ReportProfileBenchmarkNotCurrentError);
      expect((error as Error).name).toBe('ReportProfileBenchmarkNotCurrentError');
      expect((error as Error).message).toMatch(/benchmark approvals are not current/);
      expect(
        await getReportBundleByDigest(connection!, input.auditId, input.bundleDigest),
      ).toBeNull();
    });

    it('refuses promotion when no artifact store is configured, before even the benchmark gate', async () => {
      const seeded = await seedAwaitingApprovalBundle();

      await expect(
        approveAndPromoteReportQualityBundle(connection!, undefined, promotionInput(seeded)),
      ).rejects.toThrow('Promotion requires configured artifact store');
    });
  });

  describe('downstream gates (benchmark gate bypassed by the harness — every gate still refuses)', () => {
    beforeEach(() => {
      benchmarkGate.bypass = true;
    });

    it('refuses when the exact quality run/epoch/bundle digest is not current (no such bundle)', async () => {
      const input = {
        auditId: `audit-${randomUUID()}`,
        qualityRunId: `run-${randomUUID()}`,
        epoch: 1,
        bundleDigest: sha('never-recorded'),
      };

      await expect(
        approveAndPromoteReportQualityBundle(connection!, new InMemoryArtifactStore(), input),
      ).rejects.toThrow('Exact quality run/epoch/bundle digest is not current');
    });

    it('refuses when the recorded bundle no longer matches the exact run or epoch of the request', async () => {
      const seeded = await seedAwaitingApprovalBundle();

      await expect(
        approveAndPromoteReportQualityBundle(connection!, new InMemoryArtifactStore(), {
          ...seeded,
          epoch: seeded.epoch + 1,
        }),
      ).rejects.toThrow('Exact quality run/epoch/bundle digest is not current');

      await expect(
        approveAndPromoteReportQualityBundle(connection!, new InMemoryArtifactStore(), {
          ...seeded,
          qualityRunId: `run-${randomUUID()}`,
        }),
      ).rejects.toThrow('Exact quality run/epoch/bundle digest is not current');
    });

    it('refuses legacy-adapter evidence bundles until Plan 059 supplies canonical approved evidence', async () => {
      const seeded = await seedAwaitingApprovalBundle({ evidenceApprovalMode: 'legacy-adapter' });

      await expect(
        approveAndPromoteReportQualityBundle(
          connection!,
          new InMemoryArtifactStore(),
          promotionInput(seeded),
        ),
      ).rejects.toThrow(
        'Production promotion is blocked until Plan 059 supplies canonical ApprovedAuditEvidence',
      );
    });

    it('refuses a bundle that is not approvable from its current state', async () => {
      const seeded = await seedAwaitingApprovalBundle();
      await createReportBundleModel(connection!)
        .updateOne(
          { bundleDigest: seeded.bundleDigest },
          { $set: { state: 'needs-operator-review' } },
        )
        .exec();

      await expect(
        approveAndPromoteReportQualityBundle(
          connection!,
          new InMemoryArtifactStore(),
          promotionInput(seeded),
        ),
      ).rejects.toThrow('Bundle is not approvable from needs-operator-review');
    });

    it('refuses a bundle that has already been promoted', async () => {
      const seeded = await seedAwaitingApprovalBundle();
      await createReportBundleModel(connection!)
        .updateOne({ bundleDigest: seeded.bundleDigest }, { $set: { state: 'promoted' } })
        .exec();

      await expect(
        approveAndPromoteReportQualityBundle(
          connection!,
          new InMemoryArtifactStore(),
          promotionInput(seeded),
        ),
      ).rejects.toThrow('Bundle already promoted');
    });
  });
});
