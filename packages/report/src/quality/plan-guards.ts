import type {
  ApprovedAuditEvidencePayload,
  CoverageLedger,
  ReviewIssue,
  SeniorReportPlan,
} from '@odysseus/core';
import { assertCoverageLedgerComplete } from './dossier.js';

export function assertSeniorReportPlan(
  plan: SeniorReportPlan,
  evidence: ApprovedAuditEvidencePayload,
): void {
  const findings = new Set(evidence.findings.map((finding) => finding.findingId));
  const keys = new Set<string>();
  for (const project of plan.remediationProjects) {
    if (keys.has(project.projectKey))
      throw new Error(`Duplicate remediation project key: ${project.projectKey}`);
    keys.add(project.projectKey);
    if (!project.findingIds.length)
      throw new Error(`Empty remediation project: ${project.projectKey}`);
    const unknown = project.findingIds.filter((id) => !findings.has(id));
    if (unknown.length)
      throw new Error(`Remediation project references unknown finding(s): ${unknown.join(', ')}`);
  }
  const unknownPriorities = plan.executivePriorityKeys.filter((key) => !keys.has(key));
  if (unknownPriorities.length)
    throw new Error(
      `Executive priority references unknown project(s): ${unknownPriorities.join(', ')}`,
    );
}
export function assertNoBlockingReviewIssues(issues: readonly ReviewIssue[]): void {
  const blockers = issues.filter(
    (issue) =>
      issue.kind === 'objective-defect' &&
      (issue.status === 'accepted' || issue.status === 'unsure'),
  );
  if (blockers.length)
    throw new Error(
      `Known objective report defect(s) remain: ${blockers.map((x) => x.issueId).join(', ')}`,
    );
}
export function assertCoverageAndPlan(
  ledger: CoverageLedger,
  plan: SeniorReportPlan,
  evidence: ApprovedAuditEvidencePayload,
): void {
  assertSeniorReportPlan(plan, evidence);
  assertCoverageLedgerComplete(ledger);
}
export function deterministicProseViolations(text: string): string[] {
  const violations: string[] = [];
  if (/\b(?:garanti|guaranteed|certain(?:ly)?|sans aucun doute)\b/iu.test(text))
    violations.push('unsupported-certainty');
  if (/\b(?:TBT|Total Blocking Time|Speed Index)\b.{0,80}\bCore Web Vital/iu.test(text))
    violations.push('performance-taxonomy');
  return violations;
}
export function assertReauditComparabilityLanguage(text: string, comparable: boolean): void {
  if (!comparable && /\b(?:amélior|improv|regress|dégrad|progress)\w*/iu.test(text))
    throw new Error(
      'Re-audit comparison language is not allowed without comparable evidence coverage',
    );
}
