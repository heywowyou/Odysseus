import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Connection, ClientSession } from 'mongoose';
import type { ReportBundleState, ReportQualityModelCall, Sha256Digest } from '@odysseus/core';
import {
  createActiveReportBundleModel,
  createReportBundleModel,
  createReportQualityLeaseModel,
  createReportQualityRunModel,
  type ActiveReportBundleDocument,
  type ReportBundleDocument,
  type StoredLanguageCandidate,
} from './schemas/report-quality.schema.js';

function digest(value: string): Sha256Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export interface ReportQualityLease {
  qualityRunId: string;
  token: string;
  tokenHash: Sha256Digest;
  epoch: number;
  expiresAt: Date;
}

export class ReportQualityLeaseConflictError extends Error {
  constructor() {
    super('odysseus: another report quality run currently owns this audit');
    this.name = 'ReportQualityLeaseConflictError';
  }
}

export class StaleReportQualityRunError extends Error {
  constructor() {
    super('odysseus: report quality lease/epoch is stale; late worker output was discarded');
    this.name = 'StaleReportQualityRunError';
  }
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    Number((error as { code?: unknown }).code) === 11000,
  );
}

export async function acquireReportQualityLease(
  connection: Connection,
  auditId: string,
  leaseMs = 30 * 60 * 1000,
): Promise<ReportQualityLease> {
  const model = createReportQualityLeaseModel(connection);
  const qualityRunId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = digest(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  let row;
  try {
    row = await model
      .findOneAndUpdate(
        {
          auditId,
          $or: [{ leaseExpiresAt: { $lte: now } }, { qualityRunId }],
        },
        {
          $set: { qualityRunId, leaseTokenHash: tokenHash, leaseExpiresAt: expiresAt },
          $inc: { epoch: 1 },
          $setOnInsert: { auditId },
        },
        { new: true, upsert: true },
      )
      .lean();
  } catch (error) {
    if (isDuplicateKey(error)) throw new ReportQualityLeaseConflictError();
    throw error;
  }
  if (!row || row.qualityRunId !== qualityRunId) throw new ReportQualityLeaseConflictError();
  return {
    qualityRunId,
    token,
    tokenHash,
    epoch: row.epoch,
    expiresAt,
  };
}

export async function assertReportQualityLease(
  connection: Connection,
  auditId: string,
  lease: ReportQualityLease,
): Promise<void> {
  const row = await createReportQualityLeaseModel(connection)
    .findOne({
      auditId,
      qualityRunId: lease.qualityRunId,
      leaseTokenHash: lease.tokenHash,
      epoch: lease.epoch,
      leaseExpiresAt: { $gt: new Date() },
    })
    .lean();
  if (!row) throw new StaleReportQualityRunError();
}

export async function renewReportQualityLease(
  connection: Connection,
  auditId: string,
  lease: ReportQualityLease,
  leaseMs = 30 * 60 * 1000,
): Promise<ReportQualityLease> {
  const expiresAt = new Date(Date.now() + leaseMs);
  const row = await createReportQualityLeaseModel(connection)
    .findOneAndUpdate(
      {
        auditId,
        qualityRunId: lease.qualityRunId,
        leaseTokenHash: lease.tokenHash,
        epoch: lease.epoch,
        leaseExpiresAt: { $gt: new Date() },
      },
      { $set: { leaseExpiresAt: expiresAt } },
      { new: true },
    )
    .lean();
  if (!row) throw new StaleReportQualityRunError();
  return { ...lease, expiresAt };
}

export async function releaseReportQualityLease(
  connection: Connection,
  auditId: string,
  lease: ReportQualityLease,
): Promise<void> {
  await createReportQualityLeaseModel(connection).deleteOne({
    auditId,
    qualityRunId: lease.qualityRunId,
    leaseTokenHash: lease.tokenHash,
    epoch: lease.epoch,
  });
}

export async function startReportQualityRun(
  connection: Connection,
  auditId: string,
  lease: ReportQualityLease,
): Promise<void> {
  const now = new Date();
  await createReportQualityRunModel(connection).create({
    qualityRunId: lease.qualityRunId,
    auditId,
    epoch: lease.epoch,
    leaseTokenHash: lease.tokenHash,
    state: 'running',
    modelCalls: [],
    candidateDigests: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function transitionReportQualityRun(
  connection: Connection,
  auditId: string,
  lease: ReportQualityLease,
  state: ReportBundleState,
  patch: {
    inputSnapshotDigest?: Sha256Digest;
    approvedEvidenceDigest?: Sha256Digest;
    modelCall?: ReportQualityModelCall;
    candidateDigest?: Sha256Digest;
    operatorApprovalBundleDigest?: Sha256Digest;
    errorCode?: string;
  } = {},
): Promise<void> {
  await assertReportQualityLease(connection, auditId, lease);
  const update: Record<string, unknown> = {
    $set: {
      state,
      updatedAt: new Date(),
      ...(patch.inputSnapshotDigest ? { inputSnapshotDigest: patch.inputSnapshotDigest } : {}),
      ...(patch.approvedEvidenceDigest
        ? { approvedEvidenceDigest: patch.approvedEvidenceDigest }
        : {}),
      ...(patch.operatorApprovalBundleDigest
        ? { operatorApprovalBundleDigest: patch.operatorApprovalBundleDigest }
        : {}),
      ...(patch.errorCode ? { errorCode: patch.errorCode } : {}),
    },
  };
  const push: Record<string, unknown> = {};
  if (patch.modelCall) push.modelCalls = patch.modelCall;
  if (patch.candidateDigest) push.candidateDigests = patch.candidateDigest;
  if (Object.keys(push).length > 0) update.$push = push;

  const result = await createReportQualityRunModel(connection).updateOne(
    { qualityRunId: lease.qualityRunId, auditId, epoch: lease.epoch },
    update,
  );
  if (result.matchedCount !== 1) throw new StaleReportQualityRunError();
}

export async function recordQualityApprovedBundle(
  connection: Connection,
  input: {
    bundleId: string;
    qualityRunId: string;
    auditId: string;
    epoch: number;
    bundleDigest: Sha256Digest;
    inputSnapshotDigest: Sha256Digest;
    approvedEvidenceDigest: Sha256Digest;
    evidenceApprovalMode: 'system' | 'operator' | 'legacy-adapter';
    fr: StoredLanguageCandidate;
    en: StoredLanguageCandidate;
  },
): Promise<void> {
  await createReportBundleModel(connection).create({
    ...input,
    state: 'awaiting-operator-approval',
    createdAt: new Date(),
  });
}

export async function getLatestReportBundle(
  connection: Connection,
  auditId: string,
): Promise<ReportBundleDocument | null> {
  return createReportBundleModel(connection)
    .findOne({ auditId })
    .sort({ createdAt: -1 })
    .lean<ReportBundleDocument | null>();
}

export async function getReportBundleByDigest(
  connection: Connection,
  auditId: string,
  bundleDigest: Sha256Digest,
): Promise<ReportBundleDocument | null> {
  return createReportBundleModel(connection)
    .findOne({ auditId, bundleDigest })
    .lean<ReportBundleDocument | null>();
}

export async function approveExactReportBundle(
  connection: Connection,
  input: {
    auditId: string;
    qualityRunId: string;
    epoch: number;
    bundleDigest: Sha256Digest;
  },
): Promise<ReportBundleDocument> {
  const bundle = await createReportBundleModel(connection)
    .findOneAndUpdate(
      {
        auditId: input.auditId,
        qualityRunId: input.qualityRunId,
        epoch: input.epoch,
        bundleDigest: input.bundleDigest,
        state: 'awaiting-operator-approval',
      },
      { $set: { state: 'operator-approved', operatorApprovedAt: new Date() } },
      { new: true },
    )
    .lean<ReportBundleDocument | null>();
  if (!bundle) {
    throw new Error(
      'odysseus: operator approval rejected because the exact quality run/bundle digest is not current',
    );
  }
  return bundle;
}

/**
 * The operator-driven half of the bundle lifecycle. The quality run's lease
 * is released the moment the run finishes, so approval and promotion happen
 * hours or days later with no lease to assert; the exact quality run, epoch
 * and bundle digest are the authority instead. A no-match is a stale
 * approval attempt against a superseded run, not a lost race to recover.
 */
export async function markReportQualityRunFromOperator(
  connection: Connection,
  input: {
    auditId: string;
    qualityRunId: string;
    epoch: number;
    bundleDigest: Sha256Digest;
    state: Extract<ReportBundleState, 'operator-approved' | 'promoted'>;
  },
): Promise<void> {
  const result = await createReportQualityRunModel(connection).updateOne(
    { qualityRunId: input.qualityRunId, auditId: input.auditId, epoch: input.epoch },
    {
      $set: {
        state: input.state,
        operatorApprovalBundleDigest: input.bundleDigest,
        updatedAt: new Date(),
      },
    },
  );
  if (result.matchedCount !== 1) throw new StaleReportQualityRunError();
}

async function activateInsideSession(
  connection: Connection,
  session: ClientSession,
  input: {
    auditId: string;
    bundle: ReportBundleDocument;
    frObjectKey: string;
    enObjectKey: string;
    expectedRevision: number;
  },
): Promise<ActiveReportBundleDocument> {
  const activeModel = createActiveReportBundleModel(connection);
  const now = new Date();
  const replacement = {
    auditId: input.auditId,
    bundleId: input.bundle.bundleId,
    qualityRunId: input.bundle.qualityRunId,
    bundleDigest: input.bundle.bundleDigest,
    epoch: input.bundle.epoch,
    revision: input.expectedRevision + 1,
    fr: { pdfDigest: input.bundle.fr.pdfDigest, objectKey: input.frObjectKey },
    en: { pdfDigest: input.bundle.en.pdfDigest, objectKey: input.enObjectKey },
    activatedAt: now,
  };

  let active: ActiveReportBundleDocument | null;
  if (input.expectedRevision === 0) {
    try {
      active = await activeModel
        .create([replacement], { session })
        .then((rows) => rows[0]!.toObject());
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new Error('odysseus: active report bundle changed before atomic promotion', {
          cause: error,
        });
      }
      throw error;
    }
  } else {
    active = await activeModel
      .findOneAndUpdate(
        { auditId: input.auditId, revision: input.expectedRevision },
        { $set: replacement },
        { new: true, session },
      )
      .lean<ActiveReportBundleDocument | null>();
    if (!active) throw new Error('odysseus: active report bundle changed before atomic promotion');
  }

  const bundleUpdate = await createReportBundleModel(connection).updateOne(
    {
      bundleId: input.bundle.bundleId,
      bundleDigest: input.bundle.bundleDigest,
      state: 'operator-approved',
    },
    {
      $set: {
        state: 'promoted',
        promotedAt: now,
        'fr.objectKey': input.frObjectKey,
        'en.objectKey': input.enObjectKey,
      },
    },
    { session },
  );
  if (bundleUpdate.modifiedCount !== 1) {
    throw new Error('odysseus: report bundle promotion lost its approved state');
  }
  return active!;
}

export async function getActiveReportBundle(
  connection: Connection,
  auditId: string,
): Promise<ActiveReportBundleDocument | null> {
  return createActiveReportBundleModel(connection)
    .findOne({ auditId })
    .lean<ActiveReportBundleDocument | null>();
}

export async function atomicallyActivateReportBundle(
  connection: Connection,
  input: {
    auditId: string;
    bundle: ReportBundleDocument;
    frObjectKey: string;
    enObjectKey: string;
  },
): Promise<ActiveReportBundleDocument> {
  const current = await getActiveReportBundle(connection, input.auditId);
  const expectedRevision = current?.revision ?? 0;
  const session = await connection.startSession();
  try {
    let activated: ActiveReportBundleDocument | undefined;
    await session.withTransaction(async () => {
      activated = await activateInsideSession(connection, session, {
        ...input,
        expectedRevision,
      });
    });
    if (!activated) throw new Error('odysseus: atomic report bundle transaction did not commit');
    return activated;
  } finally {
    await session.endSession();
  }
}
