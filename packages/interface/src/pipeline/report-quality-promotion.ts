import type { Connection } from 'mongoose';
import type { Sha256Digest } from '@odysseus/core';
import { assertProductionProfileBenchmarksCurrent } from '@odysseus/llm';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import {
  getAuditRuntimeFields,
  approveExactReportBundle,
  atomicallyActivateReportBundle,
  getReportBundleByDigest,
  markReportQualityRunFromOperator,
} from '@odysseus/store';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { readAuditEvidenceQualitySummary } from './audit-evidence-quality.js';
import { promoteContentAddressedPdf } from './report-quality-storage.js';
export async function approveAndPromoteReportQualityBundle(
  connection: Connection,
  artifactStore: ArtifactStore | undefined,
  input: { auditId: string; qualityRunId: string; epoch: number; bundleDigest: Sha256Digest },
) {
  if (!artifactStore) throw new Error('Promotion requires configured artifact store');
  // Plan 058 §6.1: production promotion also requires every role's corpus
  // benchmark approval to be current, not merely a configured model string.
  assertProductionProfileBenchmarksCurrent();
  const current = await getReportBundleByDigest(connection, input.auditId, input.bundleDigest);
  if (!current || current.qualityRunId !== input.qualityRunId || current.epoch !== input.epoch)
    throw new Error('Exact quality run/epoch/bundle digest is not current');
  if (current.evidenceApprovalMode === 'legacy-adapter')
    throw new Error(
      'Production promotion is blocked until Plan 059 supplies canonical ApprovedAuditEvidence',
    );
  if (current.state === 'promoted') throw new Error('Bundle already promoted');
  if (current.state !== 'awaiting-operator-approval' && current.state !== 'operator-approved') {
    throw new Error(`Bundle is not approvable from ${current.state}`);
  }
  // Plan 059 section 20: promotion is the last conflict gate on the evidence
  // approval. The bundle pins the digest of the approval it was produced
  // from; that approval must still stand next to the roots it names, so an
  // audit re-assessed without approval (or whose roots no longer match)
  // cannot be promoted into a Plan 058 report path silently. The findings
  // comparison stays the loader's job at run time: this bundle's content is
  // already rendered and digest-bound, only the roots can have moved.
  const audit = await getAuditRuntimeFields(connection, input.auditId);
  if (audit === null) throw new Error('Bundle promotion refused: audit not found');
  const auditHostname = new URL(audit.siteUrl).hostname;
  const summary = await readAuditEvidenceQualitySummary({
    auditDir: buildAuditDir(getArtifactsRoot(), auditHostname, audit.startedAt),
    hostname: auditHostname,
    startedAt: audit.startedAt,
    store: artifactStore,
  });
  if (
    summary === undefined ||
    summary.approval !== 'approved' ||
    summary.approvalDigest !== current.approvedEvidenceDigest
  ) {
    throw new Error(
      'Bundle promotion refused: the evidence approval this bundle was produced from no longer stands; rerun the quality pipeline',
    );
  }
  const approved =
    current.state === 'awaiting-operator-approval'
      ? await approveExactReportBundle(connection, input)
      : current;
  await markReportQualityRunFromOperator(connection, { ...input, state: 'operator-approved' });
  const [frObjectKey, enObjectKey] = await Promise.all([
    promoteContentAddressedPdf(artifactStore, approved.fr.privateObjectKey, approved.fr.pdfDigest),
    promoteContentAddressedPdf(artifactStore, approved.en.privateObjectKey, approved.en.pdfDigest),
  ]);
  const active = await atomicallyActivateReportBundle(connection, {
    auditId: input.auditId,
    bundle: approved,
    frObjectKey,
    enObjectKey,
  });
  await markReportQualityRunFromOperator(connection, { ...input, state: 'promoted' });
  return { bundleDigest: active.bundleDigest, revision: active.revision };
}
