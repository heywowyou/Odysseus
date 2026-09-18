export { buildReportFactRegistry } from './fact-registry.js';
import type {
  ApprovedAuditEvidencePayload,
  CoverageLedger,
  ReportEvidenceDossier,
  ReportInputSnapshot,
  SeniorReportPlan,
} from '@odysseus/core';
import { reportQualityDigest } from './digest.js';

export function buildInitialCoverageLedger(
  evidence: ApprovedAuditEvidencePayload,
  snapshot: ReportInputSnapshot,
): CoverageLedger {
  return {
    inputSnapshotDigest: snapshot.approvedEvidenceDigest,
    entries: evidence.findings.map((finding) => ({
      findingId: finding.findingId,
      severity: finding.severity,
      eligible: finding.severity !== 'minor',
      disposition: finding.severity === 'minor' ? 'appendix-only' : 'unassigned',
    })),
  };
}
export function buildReportEvidenceDossier(
  evidence: ApprovedAuditEvidencePayload,
  snapshot: ReportInputSnapshot,
): ReportEvidenceDossier {
  const byCategory = new Map<string, typeof evidence.findings>();
  for (const finding of evidence.findings)
    byCategory.set(finding.category, [...(byCategory.get(finding.category) ?? []), finding]);
  return {
    inputSnapshotDigest: snapshot.approvedEvidenceDigest,
    packets: [...byCategory.entries()].map(([category, findings]) => ({
      packetId: `packet:${category}`,
      category: category as (typeof findings)[number]['category'],
      findingIds: findings.map((f) => f.findingId),
      representativeEvidenceRefs: findings.flatMap((f) => f.pageUrls).slice(0, 20),
    })),
    patterns: evidence.patternEvidence ?? [],
    coverageLedger: buildInitialCoverageLedger(evidence, snapshot),
  };
}
export function reconcileCoverageLedger(
  ledger: CoverageLedger,
  plan: SeniorReportPlan,
): CoverageLedger {
  const owners = new Map<string, string>();
  for (const project of plan.remediationProjects)
    for (const id of project.findingIds) {
      if (owners.has(id))
        throw new Error(`Finding ${id} is assigned to multiple remediation projects`);
      owners.set(id, project.projectKey);
    }
  return {
    ...ledger,
    entries: ledger.entries.map((entry) =>
      owners.has(entry.findingId)
        ? { ...entry, disposition: 'project', projectKey: owners.get(entry.findingId)! }
        : entry,
    ),
  };
}
export function assertCoverageLedgerComplete(
  ledger: CoverageLedger,
  evidence?: ApprovedAuditEvidencePayload,
): void {
  if (evidence) {
    // The ledger must be the ledger of THIS approved evidence payload: bound
    // to its snapshot digest and accounting for every finding exactly once,
    // otherwise an omitted finding would silently escape the disposition
    // check below.
    if (ledger.inputSnapshotDigest !== reportQualityDigest(evidence.approval))
      throw new Error(
        'Coverage ledger input snapshot digest does not match the approved evidence payload',
      );
    const membership = new Map<string, number>();
    for (const entry of ledger.entries)
      membership.set(entry.findingId, (membership.get(entry.findingId) ?? 0) + 1);
    const absent = evidence.findings.filter((finding) => !membership.has(finding.findingId));
    const duplicated = [...membership.entries()]
      .filter(([, count]) => count > 1)
      .map(([findingId]) => findingId);
    if (absent.length || duplicated.length)
      throw new Error(
        `Coverage ledger does not account for the approved evidence (missing: ${
          absent.map((finding) => finding.findingId).join(', ') || 'none'
        }; duplicated: ${duplicated.join(', ') || 'none'})`,
      );
  }
  const unassigned = ledger.entries.filter(
    (entry) => entry.eligible && entry.disposition !== 'project',
  );
  if (unassigned.length)
    throw new Error(
      `Senior report plan omitted eligible finding(s): ${unassigned.map((x) => x.findingId).join(', ')}`,
    );
}
export function assertMandatoryDisclosures(
  limitations: ApprovedAuditEvidencePayload['mandatoryDisclosures'],
  renderedDestinations: string[],
): void {
  const rendered = new Set(renderedDestinations);
  const missing = limitations.filter((item) => !rendered.has(item.reportDestination));
  if (missing.length)
    throw new Error(
      `Mandatory evidence disclosure(s) have no report destination: ${missing.map((x) => x.limitationId).join(', ')}`,
    );
}
