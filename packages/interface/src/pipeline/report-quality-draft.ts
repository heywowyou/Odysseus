import {
  buildFindingsProvenance,
  type ApprovedAuditEvidencePayload,
  type ObligationAssessment,
  type ReportFactRegistry,
  type ReportLanguage,
  type SeniorReportPlan,
} from '@odysseus/core';
import type { EditorOutput, QualityWriterOutput } from '@odysseus/llm';
import {
  deterministicProseViolations,
  reportQualityDigest,
  resolveEvidenceBoundContent,
  type StoredAnalysis,
} from '@odysseus/report';
function risk(e: ApprovedAuditEvidencePayload): 'low' | 'medium' | 'high' {
  if (e.findings.some((f) => f.severity === 'critical' || f.severity === 'serious')) return 'high';
  if (e.findings.some((f) => f.severity === 'moderate')) return 'medium';
  return 'low';
}
export function validateQualityWriterOutput(
  writer: QualityWriterOutput,
  plan: SeniorReportPlan,
  registry: ReportFactRegistry,
): void {
  const expected = new Set(plan.remediationProjects.map((p) => p.projectKey)),
    actual = new Set(writer.projects.map((p) => p.projectKey));
  if (expected.size !== actual.size || [...expected].some((k) => !actual.has(k)))
    throw new Error('Writer project coverage differs from senior plan');
  const contents = [
    writer.executiveSummary,
    writer.notes,
    ...writer.projects.flatMap((p) => [p.title, p.businessImpact, ...p.recommendedActions]),
  ];
  for (const content of contents) {
    for (const segment of content.segments)
      if (segment.kind === 'fact' && !registry.facts.some((f) => f.factId === segment.factId))
        throw new Error(`Unknown fact binding ${segment.factId}`);
  }
}
export function resolveQualityDraft(input: {
  language: ReportLanguage;
  writer: QualityWriterOutput;
  plan: SeniorReportPlan;
  registry: ReportFactRegistry;
  evidence: ApprovedAuditEvidencePayload;
  requestedModel: string;
  generatedAt: Date;
  obligationAssessment?: ObligationAssessment;
}) {
  validateQualityWriterOutput(input.writer, input.plan, input.registry);
  const prose = new Map(input.writer.projects.map((p) => [p.projectKey, p] as const));
  const priority = new Map(input.plan.executivePriorityKeys.map((k, i) => [k, i] as const));
  const resolve = (c: QualityWriterOutput['executiveSummary'], target: string) => {
    const text = resolveEvidenceBoundContent(c, input.registry, input.language);
    const v = deterministicProseViolations(text);
    if (v.length) throw new Error(`Deterministic prose violation at ${target}: ${v.join(',')}`);
    return text;
  };
  const themes = input.plan.remediationProjects
    .map((p, i) => {
      const w = prose.get(p.projectKey)!;
      return {
        title: resolve(w.title, p.projectKey + '.title'),
        category: p.category,
        businessImpact: resolve(w.businessImpact, p.projectKey + '.impact'),
        effort: p.effort,
        impact: p.impact,
        priorityRank: (priority.get(p.projectKey) ?? input.plan.remediationProjects.length + i) + 1,
        findingIds: p.findingIds,
        recommendedActions: w.recommendedActions.map((a, j) =>
          resolve(a, `${p.projectKey}.action.${j}`),
        ),
      };
    })
    .sort((a, b) => a.priorityRank - b.priorityRank);
  const seed = {
      language: input.language,
      writer: input.writer,
      plan: input.plan,
      evidence: input.evidence.approval.auditEvidenceSnapshotDigest,
    },
    draftDigest = reportQualityDigest(seed);
  const analysis: StoredAnalysis = {
    analysisId: `quality-${input.language}-${draftDigest.slice(7, 27)}`,
    auditId: input.evidence.approval.auditId,
    findingsProvenance: buildFindingsProvenance(input.evidence.findings),
    language: input.language,
    model: input.requestedModel,
    temperature: 0,
    generatedAt: input.generatedAt,
    executiveSummary: resolve(input.writer.executiveSummary, 'executiveSummary'),
    overallRisk: risk(input.evidence),
    themes,
    quickWins: input.plan.remediationProjects
      .filter((p) => p.effort === 'low' && p.impact !== 'low')
      .flatMap((p) => p.findingIds),
    notes: resolve(input.writer.notes, 'notes'),
    ...(input.obligationAssessment ? { obligationAssessment: input.obligationAssessment } : {}),
  };
  return { analysis, writer: input.writer, draftDigest };
}
export function applyTargetedWriterPatches(
  current: QualityWriterOutput,
  editor: EditorOutput,
  accepted: ReadonlySet<string>,
): QualityWriterOutput {
  const copy = structuredClone(current);
  for (const patch of editor.patches) {
    if (!accepted.has(patch.issueId))
      throw new Error(`Patch references unaccepted issue ${patch.issueId}`);
    if (patch.target === 'executiveSummary') {
      copy.executiveSummary = patch.replacement;
      continue;
    }
    if (patch.target === 'notes') {
      copy.notes = patch.replacement;
      continue;
    }
    const m = patch.target.match(
      /^projects\.([^.]+)\.(title|businessImpact|recommendedActions\.(\d+))$/,
    );
    if (!m) throw new Error(`Unsupported patch target ${patch.target}`);
    const p = copy.projects.find((x) => x.projectKey === m[1]);
    if (!p) throw new Error('Unknown patch project');
    if (m[2] === 'title') p.title = patch.replacement;
    else if (m[2] === 'businessImpact') p.businessImpact = patch.replacement;
    else p.recommendedActions[Number(m[3])] = patch.replacement;
  }
  return copy;
}
