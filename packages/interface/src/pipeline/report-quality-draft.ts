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
  // Presentation order is deterministic and code-bound (Plan 058 §5.6):
  // executive priorities first in their declared order, remaining projects
  // in plan order, and every dependency placed before its dependent — so a
  // dependent never presents before the work it assumes. Ranks are dense
  // 1..N; sparse or off-by-count ranks read as broken ordinals to clients.
  const knownKeys = new Set(input.plan.remediationProjects.map((p) => p.projectKey));
  const sortKey = new Map(
    input.plan.remediationProjects.map(
      (p, i) =>
        [
          p.projectKey,
          (priority.get(p.projectKey) ?? input.plan.remediationProjects.length) * 1000 + i,
        ] as const,
    ),
  );
  const ordered: SeniorReportPlan['remediationProjects'] = [];
  const placed = new Set<string>();
  const remaining = [...input.plan.remediationProjects];
  while (remaining.length > 0) {
    let best = -1;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]!;
      const ready = candidate.dependencies.every((d) => !knownKeys.has(d) || placed.has(d));
      if (
        ready &&
        (best === -1 ||
          sortKey.get(candidate.projectKey)! < sortKey.get(remaining[best]!.projectKey)!)
      ) {
        best = i;
      }
    }
    // A dependency cycle cannot satisfy the ready rule; take the first
    // remaining project so the order stays deterministic.
    if (best === -1) best = 0;
    const next = remaining.splice(best, 1)[0]!;
    placed.add(next.projectKey);
    ordered.push(next);
  }
  const resolve = (c: QualityWriterOutput['executiveSummary'], target: string) => {
    const text = resolveEvidenceBoundContent(c, input.registry, input.language);
    const v = deterministicProseViolations(text);
    if (v.length) throw new Error(`Deterministic prose violation at ${target}: ${v.join(',')}`);
    return text;
  };
  const themes = ordered.map((p, i) => {
    const w = prose.get(p.projectKey)!;
    return {
      title: resolve(w.title, p.projectKey + '.title'),
      category: p.category,
      businessImpact: resolve(w.businessImpact, p.projectKey + '.impact'),
      effort: p.effort,
      impact: p.impact,
      priorityRank: i + 1,
      findingIds: p.findingIds,
      recommendedActions: w.recommendedActions.map((a, j) =>
        resolve(a, `${p.projectKey}.action.${j}`),
      ),
    };
  });
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
const ADDRESS =
  /^(?:executiveSummary|notes|projects\.[^.\s,;]+\.(?:title|businessImpact|recommendedActions(?:\.\d+)?))$/;

/** Every semantic address a model-authored draft exposes, in draft order.
 *  Critics name their targets from this list so the editor's patch can be
 *  held to exactly what was adjudicated. */
export function writerPatchAddresses(writer: QualityWriterOutput): string[] {
  return [
    'executiveSummary',
    'notes',
    ...writer.projects.flatMap((p) => [
      `projects.${p.projectKey}.title`,
      `projects.${p.projectKey}.businessImpact`,
      ...p.recommendedActions.map((_, i) => `projects.${p.projectKey}.recommendedActions.${i}`),
    ]),
  ];
}

/** The patch addresses a review issue declares. A critic may name several,
 *  separated by commas, semicolons or whitespace; anything that is not an
 *  address is ignored, so an issue with none cannot authorize a patch. */
export function declaredPatchTargets(target: string): string[] {
  return target.split(/[\s,;]+/).filter((part) => ADDRESS.test(part));
}

function withinDeclared(target: string, declared: readonly string[]): boolean {
  return declared.some(
    (address) =>
      address === target ||
      (address.endsWith('.recommendedActions') && target.startsWith(`${address}.`)),
  );
}

/** Plan 058 §5.8: a patch carries an accepted issue id and may touch only a
 *  target that issue declared; anything else is collateral change and the
 *  whole edit is refused before the draft is touched. */
export function applyTargetedWriterPatches(
  current: QualityWriterOutput,
  editor: EditorOutput,
  accepted: ReadonlyMap<string, readonly string[]>,
): QualityWriterOutput {
  for (const patch of editor.patches) {
    const declared = accepted.get(patch.issueId);
    if (declared === undefined)
      throw new Error(`Patch references unaccepted issue ${patch.issueId}`);
    if (!withinDeclared(patch.target, declared))
      throw new Error(
        `Patch target ${patch.target} is outside the targets issue ${patch.issueId} declared`,
      );
  }
  const copy = structuredClone(current);
  for (const patch of editor.patches) {
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
    else {
      const index = Number(m[3]);
      if (index >= p.recommendedActions.length)
        throw new Error(`Unknown patch action ${patch.target}`);
      p.recommendedActions[index] = patch.replacement;
    }
  }
  return copy;
}
