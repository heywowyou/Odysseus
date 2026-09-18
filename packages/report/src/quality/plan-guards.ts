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
  const membership = new Map<string, string>();
  for (const project of plan.remediationProjects) {
    if (keys.has(project.projectKey))
      throw new Error(`Duplicate remediation project key: ${project.projectKey}`);
    keys.add(project.projectKey);
    if (!project.findingIds.length)
      throw new Error(`Empty remediation project: ${project.projectKey}`);
    const unknown = project.findingIds.filter((id) => !findings.has(id));
    if (unknown.length)
      throw new Error(`Remediation project references unknown finding(s): ${unknown.join(', ')}`);
    for (const id of project.findingIds) {
      const owner = membership.get(id);
      if (owner && owner !== project.projectKey)
        throw new Error(
          `Finding ${id} is assigned to multiple remediation projects (${owner}, ${project.projectKey})`,
        );
      membership.set(id, project.projectKey);
    }
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
  assertCoverageLedgerComplete(ledger, evidence);
}
const windowedPair = (left: string, right: string): string =>
  `${left}[^.!?]{0,80}${right}|${right}[^.!?]{0,80}${left}`;
// JS \b is ASCII-only, so a stem ending in an accented letter ('manqué',
// 'corrigé') can never satisfy a trailing \b. Guard word endings with a
// Unicode letter/number lookahead instead.
const WORD_END = String.raw`(?![\p{L}\p{N}])`;
const BUSINESS_OBJECT = String.raw`\b(?:bookings?|reservations?|revenues?|revenue|sales|ventes|conversions?|leads?|enquir(?:y|ies)|demandes?|customers?|clients?|chiffre d'affaires|r[ée]servations?|revenus?)${WORD_END}`;
const REALIZED_LOSS = String.raw`\b(?:lost|loses?|losing|missed|missings?|forfeit\w*|sacrific\w*|costs?|costing|perdu(?:s|e(?:s)?)?|perdre|pertes?|manqu[ée]e?s?|rat[ée]e?s?|co[ûu]t(?:e|es|ant)?)${WORD_END}`;
const NEWLY_OBSERVABLE_LABEL = String.raw`\b(?:newly[- ]observables?|nouvellement\s+(?:observables?|mesurables?))${WORD_END}`;
const NEW_OR_REGRESSION_CLAIM = String.raw`\b(?:(?:newly|nouvellement)\s+(?:introduced|added|appeared|introduit|apparu)|new\s+(?:issue|problem|defect)|nouveau\s+(?:probl[èe]me|d[ée]faut)|regress\w*|r[ée]gress\w*)${WORD_END}`;
const NOT_COMPARABLE_LABEL = String.raw`\b(?:not[- ]comparables?|non[- ]comparables?|pas\s+comparables?|impossible\s+de\s+comparer)${WORD_END}`;
const RESOLVED_CLAIM = String.raw`\b(?:resolv\w*|fixed|corrected|now\s+(?:clean|compliant|gone)|r[ée]solu(?:e|s|es)?|corrig[ée]e?s?|disparu(?:e|s)?)${WORD_END}`;
const BUSINESS_CAUSALITY = new RegExp(windowedPair(REALIZED_LOSS, BUSINESS_OBJECT), 'iu');
const NEWLY_OBSERVABLE_SPIN = new RegExp(
  windowedPair(NEWLY_OBSERVABLE_LABEL, NEW_OR_REGRESSION_CLAIM),
  'iu',
);
const NOT_COMPARABLE_SPIN = new RegExp(windowedPair(NOT_COMPARABLE_LABEL, RESOLVED_CLAIM), 'iu');
export function deterministicProseViolations(text: string): string[] {
  const violations: string[] = [];
  if (/\b(?:garanti|guaranteed|certain(?:ly)?|sans aucun doute)\b/iu.test(text))
    violations.push('unsupported-certainty');
  if (
    /\b(?:TBT|Total Blocking Time|Speed Index)\b.{0,80}\bCore Web Vital/iu.test(text) ||
    /\b(?:TBT|Total Blocking Time|Speed Index)\b.{0,80}\b(?:field data|donn[ée]es de terrain|real[- ]user)/iu.test(
      text,
    )
  )
    violations.push('performance-taxonomy');
  if (BUSINESS_CAUSALITY.test(text)) violations.push('unsupported-business-causality');
  if (NEWLY_OBSERVABLE_SPIN.test(text)) violations.push('newly-observable-as-new-or-regression');
  if (NOT_COMPARABLE_SPIN.test(text)) violations.push('not-comparable-as-resolved');
  return violations;
}
export function assertReauditComparabilityLanguage(text: string, comparable: boolean): void {
  if (!comparable && /\b(?:amélior|improv|regress|dégrad|progress)\w*/iu.test(text))
    throw new Error(
      'Re-audit comparison language is not allowed without comparable evidence coverage',
    );
}
