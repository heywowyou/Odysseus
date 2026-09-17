import type { ApprovedAuditEvidencePayload, CoverageLedger, ReportEvidenceDossier, ReportFact, ReportFactRegistry, ReportInputSnapshot, ReportOnlyInputs, SeniorReportPlan } from '@odysseus/core';

export function buildReportFactRegistry(evidence: ApprovedAuditEvidencePayload, snapshot: ReportInputSnapshot, inputs: ReportOnlyInputs): ReportFactRegistry {
  const facts: ReportFact[] = [];
  const add = (fact: ReportFact) => { if (!facts.some((item) => item.factId === fact.factId)) facts.push(fact); };
  add({ factId: 'audit.siteUrl', kind: 'url', value: evidence.manifest.siteUrl, display: { fr: evidence.manifest.siteUrl, en: evidence.manifest.siteUrl }, sourceRefs: [evidence.approval.auditEvidenceSnapshotDigest] });
  add({ factId: 'audit.pagesVisited', kind: 'number', value: evidence.manifest.crawl.visitedCount, display: { fr: String(evidence.manifest.crawl.visitedCount), en: String(evidence.manifest.crawl.visitedCount) }, sourceRefs: [evidence.approval.auditEvidenceSnapshotDigest] });
  add({ factId: 'audit.findingCount', kind: 'number', value: evidence.findings.length, display: { fr: String(evidence.findings.length), en: String(evidence.findings.length) }, sourceRefs: [evidence.approval.auditEvidenceSnapshotDigest] });
  if (inputs.manualFields?.siren?.value) add({ factId: 'identity.siren', kind: 'identifier', value: inputs.manualFields.siren.value, display: { fr: inputs.manualFields.siren.value, en: inputs.manualFields.siren.value }, sourceRefs: [snapshot.reportOnlyInputsDigest] });
  return { registryVersion: '058-v1', inputSnapshotDigest: snapshot.auditId ? (snapshot.approvedEvidenceDigest) : snapshot.approvedEvidenceDigest, facts };
}

export function buildInitialCoverageLedger(evidence: ApprovedAuditEvidencePayload, snapshot: ReportInputSnapshot): CoverageLedger {
  return { inputSnapshotDigest: snapshot.approvedEvidenceDigest, entries: evidence.findings.map((finding) => ({ findingId: finding.findingId, severity: finding.severity, eligible: finding.severity !== 'minor', disposition: finding.severity === 'minor' ? 'appendix-only' : 'unassigned' })) };
}
export function buildReportEvidenceDossier(evidence: ApprovedAuditEvidencePayload, snapshot: ReportInputSnapshot): ReportEvidenceDossier {
  const byCategory = new Map<string, typeof evidence.findings>();
  for (const finding of evidence.findings) byCategory.set(finding.category, [...(byCategory.get(finding.category) ?? []), finding]);
  return {
    inputSnapshotDigest: snapshot.approvedEvidenceDigest,
    packets: [...byCategory.entries()].map(([category, findings]) => ({ packetId: `packet:${category}`, category: category as typeof findings[number]['category'], findingIds: findings.map((f) => f.findingId), representativeEvidenceRefs: findings.flatMap((f) => f.pageUrls).slice(0, 20) })),
    patterns: evidence.patternEvidence ?? [],
    coverageLedger: buildInitialCoverageLedger(evidence, snapshot),
  };
}
export function reconcileCoverageLedger(ledger: CoverageLedger, plan: SeniorReportPlan): CoverageLedger {
  const owners = new Map<string, string>();
  for (const project of plan.remediationProjects) for (const id of project.findingIds) {
    if (owners.has(id)) throw new Error(`Finding ${id} is assigned to multiple remediation projects`);
    owners.set(id, project.projectKey);
  }
  return { ...ledger, entries: ledger.entries.map((entry) => owners.has(entry.findingId) ? { ...entry, disposition: 'project', projectKey: owners.get(entry.findingId)! } : entry) };
}
export function assertCoverageLedgerComplete(ledger: CoverageLedger): void {
  const missing = ledger.entries.filter((entry) => entry.eligible && entry.disposition !== 'project');
  if (missing.length) throw new Error(`Senior report plan omitted eligible finding(s): ${missing.map((x) => x.findingId).join(', ')}`);
}
export function assertMandatoryDisclosures(limitations: ApprovedAuditEvidencePayload['mandatoryDisclosures'], renderedDestinations: string[]): void {
  const rendered = new Set(renderedDestinations);
  const missing = limitations.filter((item) => !rendered.has(item.reportDestination));
  if (missing.length) throw new Error(`Mandatory evidence disclosure(s) have no report destination: ${missing.map((x) => x.limitationId).join(', ')}`);
}
