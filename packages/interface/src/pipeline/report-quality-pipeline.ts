import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  buildFindingsProvenance,
  buildReportPreparationPreview,
  computeFindingsDelta,
  type ApprovedAuditEvidencePayload,
  type AuditManifest,
  type Finding,
  type ReportBundleCandidate,
  type ReportEvidenceDossier,
  type ReportQualityRole,
  type ReportFactRegistry,
  type ReportInputSnapshot,
  type ReportLanguage,
  type ReportOnlyInputs,
  type ReviewIssue,
  type SeniorReportPlan,
  type Sha256Digest,
} from '@odysseus/core';
import {
  boundPatternEvidenceForModel,
  ADJUDICATION_JSON_SCHEMA,
  EDITOR_JSON_SCHEMA,
  FINAL_ARBITER_JSON_SCHEMA,
  QUALITY_REVIEW_JSON_SCHEMA,
  QUALITY_WRITER_JSON_SCHEMA,
  SENIOR_PLAN_JSON_SCHEMA,
  callReportQualityRole,
  editorOutputSchema,
  finalArbiterOutputSchema,
  getReportModelProfile,
  getReportModelProfileDigest,
  getReportModelProfileMatrixDigest,
  issueAdjudicationOutputSchema,
  qualityReviewOutputSchema,
  qualityWriterOutputSchema,
  reportQualitySystemPromptDigest,
  seniorPlanOutputSchema,
  toLlmFindingShape,
  type QualityReviewOutput,
  type QualityWriterOutput,
} from '@odysseus/llm';
import {
  REPORT_TEMPLATE_VERSION,
  assertCoverageLedgerComplete,
  assertMandatoryDisclosures,
  assertSeniorReportPlan,
  buildReportEvidenceDossier,
  buildReportFactRegistry,
  bytesDigest,
  canonicalPostProcessPdf,
  generateReportPdf,
  preflightPdfQualityToolchain,
  reconcileCoverageLedger,
  reportQualityDigest,
  reportRendererAssetFingerprints,
  reportRendererCodeFingerprint,
  runExactPdfQa,
} from '@odysseus/report';
import { readOdysseusBuildId } from '@odysseus/scanner';
import {
  acquireReportQualityLease,
  findAuditEvidenceCoverage,
  findDeltaBaseline,
  getAuditGradeOverride,
  getAuditManualFields,
  getReportPreparation,
  recordQualityApprovedBundle,
  releaseReportQualityLease,
  renewReportQualityLease,
  startReportQualityRun,
  syncProspectIdentityIntoAudit,
  transitionReportQualityRun,
  type ReportQualityLease,
} from '@odysseus/store';
import type { ZodType } from 'zod';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { runObligationStage } from './obligation-stage.js';
import { loadAuditEvidencePayload } from './report-quality-evidence.js';
import {
  applyTargetedWriterPatches,
  declaredPatchTargets,
  resolveQualityDraft,
  validateQualityWriterOutput,
  writerPatchAddresses,
} from './report-quality-draft.js';
import {
  ReportQualityDag,
  ReportQualityReplayMissError,
  type ReportQualityModelMode,
} from './report-quality-dag.js';
import { putImmutableJson, putPrivateCandidatePdf } from './report-quality-storage.js';

const MAX_CONTENT_REPAIR_ITERATIONS = 8;
/** Plan 058 §9/§13: writer drafts get bounded patch-prose repairs with the
 *  full accumulated rejection history before operator review. */
const MAX_WRITER_ATTEMPTS = 3;
/** Plan 058 §9/§13: the senior plan gets one bounded patch-plan repair — the
 *  deterministic rejection is named and the role re-issues the plan — before
 *  the run goes to operator review. */
const MAX_PLAN_ATTEMPTS = 2;
const VISUAL_REVIEW_PAGE_BATCH = 1;

/** What code renders around the model-authored fields. Critics and the
 *  adjudicator judge the fields in this context; without it they reported
 *  content the template already carries (a finding appendix, the
 *  limitations) as missing from the draft. */
const DETERMINISTIC_REPORT_CONTEXT =
  'Only executiveSummary, notes and each project title/businessImpact/recommendedActions are ' +
  'model-authored. Code renders the rest deterministically from approved evidence: severity and ' +
  'category statistics; the ranked priority themes built from these project fields in the ' +
  'deterministic presentation order; a remediation checklist; an observations section for ' +
  'heuristic review signals; a WCAG conformance summary; JavaScript-rendering evidence; ' +
  'Lighthouse lab and CrUX field metric tables; accessibility-statement guidance; the legal ' +
  'reference section in approved deterministic wording; the methodology section, which prints ' +
  'every mandatory limitation at its declared destination; a technical appendix listing every ' +
  'finding with its title, severity, category, WCAG criteria, affected pages and occurrences; ' +
  'and a glossary. Do not report as missing what these sections carry; do report model prose ' +
  'that contradicts them or omits significance the reader needs.';

/** The deterministic prose contract every writer and the editor receive. */
const WRITING_RULES =
  'Text segments never contain digits, percentages, dates, units or URLs — every exact ' +
  'scalar belongs in a fact segment bound to a factRegistry factId (each fact carries a label ' +
  'saying what it measures and a display the reader sees). A reference segment names only a ' +
  'factRegistry fact of kind "reference" (WCAG criteria, standards, legal citations); finding ' +
  'ids, digests and URLs are never references and never appear in prose. Put a space in the ' +
  'text around each bound value. Freehand exact scalars are rejected deterministically. ' +
  'Performance wording keeps Lighthouse lab measurements distinct from CrUX field data; TBT ' +
  'and Speed Index are never called Core Web Vitals and lab metrics never describe real user ' +
  'experience. No lost-booking, revenue or conversion causality. A newly-observable finding ' +
  'is never a regression and a not-comparable finding is never a resolution. ' +
  'Unsupported-certainty wording is rejected deterministically. Likely root causes marked as ' +
  'inference in the plan stay worded as hypotheses.';

class ReportQualityNeedsOperatorReviewError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.name = 'ReportQualityNeedsOperatorReviewError';
    this.reasonCode = reasonCode;
  }
}

/** A replay-only run reached the end of the recorded DAG with every gate
 *  passing. It is recorded as failed so it can never be approved. Thrown
 *  and handled within this module's run path only, so it stays
 *  module-private. */
class ReportQualityReplayCompleteError extends Error {
  readonly reasonCode = 'replay-only-no-qualification';
  constructor() {
    super('Replay-only run passed every recorded stage; replays never qualify a bundle');
    this.name = 'ReportQualityReplayCompleteError';
  }
}

export interface QualityLanguageCandidateResult {
  language: ReportLanguage;
  pdfDigest: Sha256Digest;
  privateObjectKey: string;
  pageCount: number;
  qaDigest: Sha256Digest;
  pageManifestDigest: Sha256Digest;
  draftDigest: Sha256Digest;
}

export interface ReportQualityPipelineResult {
  qualityRunId: string;
  epoch: number;
  state: 'awaiting-operator-approval';
  bundleId: string;
  bundleDigest: Sha256Digest;
  inputSnapshotDigest: Sha256Digest;
  evidenceApprovalMode: 'system' | 'operator' | 'legacy-adapter';
  fr: QualityLanguageCandidateResult;
  en: QualityLanguageCandidateResult;
}

interface QualityRunContext {
  connection: Connection;
  auditDir: string;
  manifest: AuditManifest;
  findings: Finding[];
  artifactStore: ArtifactStore;
  evidence: ApprovedAuditEvidencePayload;
  lease: ReportQualityLease;
  dag: ReportQualityDag;
  /** Declared parents shared by every render/QA node of this run. */
  renderParents: Record<string, unknown>;
  state:
    | 'running'
    | 'content-clean'
    | 'fr-candidate-clean'
    | 'en-candidate-clean'
    | 'parity-clean'
    | 'bundle-final-review';
}

/**
 * Every model call is a §15 DAG node keyed on the exact request: role, model
 * profile, system prompt, response schema, the serialized user payload and
 * each attached image's bytes. A matching recorded node is reused (and
 * re-parsed through the same schema); any changed parent is a new node. Only
 * a computed call is a provider call, so only it is appended to modelCalls.
 */
async function callRole<T>(
  context: QualityRunContext,
  input: {
    role: ReportQualityRole;
    userPayload: unknown;
    parser: ZodType<T>;
    jsonSchema: Record<string, unknown>;
    imagePaths?: readonly string[];
  },
): Promise<{ output: T }> {
  await keepLease(context);
  const imageDigests = await Promise.all(
    (input.imagePaths ?? []).map(async (file) => bytesDigest(await fs.readFile(file))),
  );
  const result = await context.dag.run(
    `model-${input.role}`,
    {
      role: input.role,
      profileDigest: getReportModelProfileDigest(input.role),
      systemPromptDigest: reportQualitySystemPromptDigest(input.role),
      schemaDigest: reportQualityDigest(input.jsonSchema),
      payloadDigest: bytesDigest(Buffer.from(JSON.stringify(input.userPayload), 'utf8')),
      imageDigests,
    },
    () => callReportQualityRole(input),
    (value) => input.parser.parse(value),
  );
  await transitionReportQualityRun(
    context.connection,
    context.manifest.auditId,
    context.lease,
    context.state,
    {
      ...(result.outcome === 'computed' && result.provenance
        ? { modelCall: result.provenance }
        : {}),
      dagNode: { node: `model-${input.role}`, nodeKey: result.nodeKey, outcome: result.outcome },
    },
  );
  return { output: result.output };
}

/** Model-facing views drop the run-scoped snapshot binding: the snapshot
 *  digest carries the run's creation time and build, so leaving it in a
 *  payload would make every model node unique to one run. The binding stays
 *  on the stored artifacts and the run lineage. */
function modelPlan(plan: SeniorReportPlan) {
  const { inputSnapshotDigest: _snapshot, ...rest } = plan;
  return rest;
}
function modelRegistry(registry: ReportFactRegistry) {
  const { inputSnapshotDigest: _snapshot, ...rest } = registry;
  return rest;
}
function modelDossier(dossier: ReportEvidenceDossier) {
  const { inputSnapshotDigest: _snapshot, coverageLedger, ...rest } = dossier;
  const { inputSnapshotDigest: _ledgerSnapshot, ...ledger } = coverageLedger;
  return { ...rest, coverageLedger: ledger };
}

/** Appends the adjudicated review issues to the run lineage. The corpus
 *  benchmark tallies kind/severity/status from here; issue reasons are
 *  review artifacts, not chain-of-thought, and stay inside the closed
 *  ReviewIssue contract. */
async function recordReviewIssues(
  context: QualityRunContext,
  issues: ReviewIssue[],
): Promise<void> {
  if (issues.length === 0) return;
  await transitionReportQualityRun(
    context.connection,
    context.manifest.auditId,
    context.lease,
    context.state,
    { reviewIssues: issues },
  );
}

async function keepLease(context: QualityRunContext): Promise<void> {
  context.lease = await renewReportQualityLease(
    context.connection,
    context.manifest.auditId,
    context.lease,
  );
}

function compactEvidence(evidence: ApprovedAuditEvidencePayload): unknown {
  // When and by which build the evidence was approved is lineage, not
  // evidence; a re-approval of identical evidence must not change payloads.
  const { approvedAt: _at, approvedBySystemVersion: _by, ...approval } = evidence.approval;
  return {
    approval,
    // Issue #548: the same bounds as the analysis passes' input, so a large
    // site cannot overflow a role's context and page-controlled text stays
    // short. pageCount keeps the full page total the URL sample drops.
    findings: evidence.findings.map((finding) => ({
      ...toLlmFindingShape(finding),
      pageCount: finding.pageUrls.length,
    })),
    patternEvidence: (evidence.patternEvidence ?? []).map(boundPatternEvidenceForModel),
    mandatoryDisclosures: evidence.mandatoryDisclosures,
  };
}

function normalizeSeniorPlan(
  raw: Awaited<ReturnType<typeof seniorPlanOutputSchema.parse>>,
  inputSnapshotDigest: Sha256Digest,
): SeniorReportPlan {
  return {
    planVersion: '058-v1',
    inputSnapshotDigest,
    remediationProjects: raw.remediationProjects.map((project) => ({
      projectKey: project.projectKey,
      category: project.category,
      findingIds: project.findingIds,
      evidenceRefs: project.evidenceRefs,
      factRefs: project.factRefs,
      ...(project.likelyRootCause ? { likelyRootCause: project.likelyRootCause } : {}),
      ...(project.conditionality ? { conditionality: project.conditionality } : {}),
      impact: project.impact,
      effort: project.effort,
      rationale: project.rationale,
      dependencies: project.dependencies,
      sharedDependencies: project.sharedDependencies,
    })),
    executivePriorityKeys: raw.executivePriorityKeys,
  };
}

function assertPlanBindings(
  plan: SeniorReportPlan,
  registry: ReportFactRegistry,
  evidence: ApprovedAuditEvidencePayload,
  dossier: ReturnType<typeof buildReportEvidenceDossier>,
): void {
  assertSeniorReportPlan(plan, evidence);
  const facts = new Set(registry.facts.map((fact) => fact.factId));
  const evidenceRefs = new Set<string>([
    evidence.approval.rawEvidenceSnapshotDigest,
    evidence.approval.auditEvidenceSnapshotDigest,
    evidence.approval.evidenceQualityAssessmentDigest,
    ...evidence.findings.map((finding) => finding.findingId),
    ...dossier.packets.flatMap((packet) => [packet.packetId, ...packet.representativeEvidenceRefs]),
    ...dossier.patterns.map((pattern) => pattern.patternId),
  ]);
  for (const project of plan.remediationProjects) {
    const unknownFacts = project.factRefs.filter((ref) => !facts.has(ref));
    if (unknownFacts.length > 0) {
      throw new Error(
        `Senior report plan rejected: project ${project.projectKey} references unknown fact(s): ${unknownFacts.join(', ')}`,
      );
    }
    const unknownEvidence = project.evidenceRefs.filter((ref) => !evidenceRefs.has(ref));
    if (unknownEvidence.length > 0) {
      throw new Error(
        `Senior report plan rejected: project ${project.projectKey} references unknown evidence: ${unknownEvidence.join(', ')}`,
      );
    }
  }
}

async function buildReportOnlyInputs(
  connection: Connection,
  manifest: AuditManifest,
  findings: Finding[],
): Promise<ReportOnlyInputs> {
  await syncProspectIdentityIntoAudit(connection, manifest.auditId);
  const manualFields = await getAuditManualFields(connection, manifest.auditId);
  const gradeOverride = await getAuditGradeOverride(connection, manifest.auditId);
  const preparation = buildReportPreparationPreview({
    preparation: await getReportPreparation(connection, manifest.auditId),
    commercialName: manualFields?.nomCommercial?.value,
    findings,
  });
  const baseline = await findDeltaBaseline(connection, {
    siteUrl: manifest.siteUrl,
    startedAt: new Date(manifest.startedAt),
  });
  // Plan 059 step 35: both sides of the comparison carry their persisted
  // coverage signature, so rows whose observability changed are separated
  // from genuine regressions and repairs.
  const currentCoverage = await findAuditEvidenceCoverage(connection, manifest.auditId);
  const currentProvenance = buildFindingsProvenance(findings);
  const delta =
    baseline === null
      ? undefined
      : computeFindingsDelta(baseline, {
          auditId: manifest.auditId,
          siteUrl: manifest.siteUrl,
          startedAt: manifest.startedAt,
          tool: manifest.tool,
          config: manifest.config,
          findingsProvenance: currentProvenance,
          findings,
          ...(currentCoverage !== undefined ? { coverage: currentCoverage } : {}),
        });

  let obligationAssessment;
  if (manualFields?.transactionalFlowOverride) {
    obligationAssessment = await runObligationStage(
      manifest,
      connection,
      manualFields.siren?.value,
      { hasTransactionalFlow: manualFields.transactionalFlowOverride },
    );
  }

  return {
    ...(manualFields !== undefined ? { manualFields } : {}),
    ...(gradeOverride !== undefined ? { gradeOverride } : {}),
    ...(obligationAssessment !== undefined ? { obligationAssessment } : {}),
    preparation,
    ...(delta !== undefined ? { delta } : {}),
  };
}

function reviewIssues(
  output: QualityReviewOutput,
  role: ReviewIssue['sourceRole'],
  artifactDigest: Sha256Digest,
): ReviewIssue[] {
  return output.issues.map((issue, index) => ({
    ...issue,
    issueId: `${role}:${issue.issueId || index + 1}`,
    sourceRole: role,
    artifactDigest,
  }));
}

async function adjudicateIssues(
  context: QualityRunContext,
  issues: ReviewIssue[],
  evidence: unknown,
): Promise<ReviewIssue[]> {
  if (issues.length === 0) return [];
  const call = await callRole(context, {
    role: 'issue-adjudicator',
    userPayload: { issues, evidence },
    parser: issueAdjudicationOutputSchema,
    jsonSchema: ADJUDICATION_JSON_SCHEMA,
  });
  const decisions = new Map(call.output.decisions.map((decision) => [decision.issueId, decision]));
  if (decisions.size !== issues.length || issues.some((issue) => !decisions.has(issue.issueId))) {
    throw new Error('Report issue adjudication rejected: decision coverage is incomplete');
  }
  return issues.map((issue) => ({
    ...issue,
    status: decisions.get(issue.issueId)!.status,
    reason: `${issue.reason} | adjudication: ${decisions.get(issue.issueId)!.reason}`,
  }));
}

function acceptedObjective(issues: readonly ReviewIssue[]): ReviewIssue[] {
  return issues.filter((issue) => issue.kind === 'objective-defect' && issue.status === 'accepted');
}

function materialUnsure(issues: readonly ReviewIssue[]): ReviewIssue[] {
  return issues.filter(
    (issue) =>
      issue.status === 'unsure' && (issue.severity === 'blocking' || issue.severity === 'major'),
  );
}

function resolveDraft(
  context: QualityRunContext,
  language: ReportLanguage,
  writer: QualityWriterOutput,
  plan: SeniorReportPlan,
  registry: ReportFactRegistry,
  reportInputs: ReportOnlyInputs,
) {
  return resolveQualityDraft({
    language,
    writer,
    plan,
    registry,
    evidence: context.evidence,
    requestedModel: getReportModelProfile(language === 'fr' ? 'writer-fr' : 'writer-en').model,
    generatedAt: new Date(),
    ...(reportInputs.obligationAssessment !== undefined
      ? { obligationAssessment: reportInputs.obligationAssessment }
      : {}),
  });
}

async function cleanContentDraft(
  context: QualityRunContext,
  language: ReportLanguage,
  initial: QualityWriterOutput,
  plan: SeniorReportPlan,
  registry: ReportFactRegistry,
  snapshotDigest: Sha256Digest,
  reportInputs: ReportOnlyInputs,
): Promise<QualityWriterOutput> {
  let draft = initial;
  for (let iteration = 0; iteration < MAX_CONTENT_REPAIR_ITERATIONS; iteration += 1) {
    validateQualityWriterOutput(draft, plan, registry);
    const artifact = await putImmutableJson(context.artifactStore, `draft-${language}`, {
      snapshotDigest,
      language,
      draft,
    });
    const resolved = resolveDraft(context, language, draft, plan, registry, reportInputs);

    const resolvedDraft = {
      executiveSummary: resolved.analysis.executiveSummary,
      notes: resolved.analysis.notes,
      themes: resolved.analysis.themes,
    };
    const issues: ReviewIssue[] = [];
    for (const role of ['content-critic-evidence', 'content-critic-editorial'] as const) {
      const call = await callRole(context, {
        role,
        userPayload: {
          language,
          seniorPlan: modelPlan(plan),
          factRegistry: modelRegistry(registry),
          evidence: compactEvidence(context.evidence),
          deterministicReportContext: DETERMINISTIC_REPORT_CONTEXT,
          structuredDraft: draft,
          resolvedDraft,
          patchAddresses: writerPatchAddresses(draft),
          instruction:
            'Set each issue target to one or more exact entries of patchAddresses, separated ' +
            'by commas. An objective defect whose repair needs no draft change is not a draft ' +
            'defect.',
        },
        parser: qualityReviewOutputSchema,
        jsonSchema: QUALITY_REVIEW_JSON_SCHEMA,
      });
      issues.push(...reviewIssues(call.output, role, artifact.digest));
    }

    // The adjudicator judges each issue against the exact draft it names;
    // without the draft it could only answer unsure (live pilot: 18 of 26).
    const adjudicated = await adjudicateIssues(context, issues, {
      language,
      factRegistry: modelRegistry(registry),
      evidence: compactEvidence(context.evidence),
      seniorPlan: modelPlan(plan),
      deterministicReportContext: DETERMINISTIC_REPORT_CONTEXT,
      structuredDraft: draft,
      resolvedDraft,
    });
    await recordReviewIssues(context, adjudicated);
    const unsure = materialUnsure(adjudicated);
    if (unsure.length > 0) {
      throw new ReportQualityNeedsOperatorReviewError(
        'content-review-unsure',
        `Material content issue remains unsure: ${unsure.map((issue) => issue.issueId).join(', ')}`,
      );
    }
    const defects = acceptedObjective(adjudicated);
    if (defects.length === 0) return draft;

    if (defects.some((issue) => issue.repairRoute !== 'patch-prose')) {
      throw new ReportQualityNeedsOperatorReviewError(
        'content-owner-repair-required',
        `Accepted content defect requires a non-prose owner: ${defects
          .map((issue) => `${issue.issueId}:${issue.repairRoute}`)
          .join(', ')}`,
      );
    }
    const declared = new Map(
      defects.map((issue) => [issue.issueId, declaredPatchTargets(issue.target)] as const),
    );
    const unaddressable = defects.filter((issue) => declared.get(issue.issueId)!.length === 0);
    if (unaddressable.length > 0) {
      throw new ReportQualityNeedsOperatorReviewError(
        'content-target-unaddressable',
        `Accepted content defect names no patchable draft address: ${unaddressable
          .map((issue) => `${issue.issueId}:${issue.target}`)
          .join(', ')}`,
      );
    }

    // Plan 058 §9/§13: an edit that breaks the patch contract or the
    // deterministic prose rules is re-issued with every rejection named,
    // within the same bounded ceiling as a writer draft.
    const editorRejections: string[] = [];
    for (let attempt = 1; ; attempt += 1) {
      const edit = await callRole(context, {
        role: 'editor',
        userPayload: {
          language,
          acceptedIssues: defects.map((issue) => ({
            ...issue,
            declaredTargets: declared.get(issue.issueId),
          })),
          currentDraft: draft,
          factRegistry: modelRegistry(registry),
          seniorPlan: modelPlan(plan),
          writingRules: WRITING_RULES,
          instruction:
            'Patch only the declaredTargets of each accepted issue. Preserve every other field ' +
            'byte-for-byte.',
          ...(editorRejections.length > 0 ? { previousEditRejections: editorRejections } : {}),
        },
        parser: editorOutputSchema,
        jsonSchema: EDITOR_JSON_SCHEMA,
      });
      try {
        const patched = applyTargetedWriterPatches(draft, edit.output, declared);
        resolveDraft(context, language, patched, plan, registry, reportInputs);
        draft = patched;
        break;
      } catch (error) {
        editorRejections.push(error instanceof Error ? error.message : String(error));
        if (attempt >= MAX_WRITER_ATTEMPTS) {
          throw new ReportQualityNeedsOperatorReviewError(
            'editor-repair-limit',
            `Editor patch failed its deterministic gates after ${String(attempt)} attempts: ${editorRejections.join(' | ')}`,
          );
        }
      }
    }
  }

  throw new ReportQualityNeedsOperatorReviewError(
    'content-repair-limit',
    `Content did not reach zero known objective defects within ${MAX_CONTENT_REPAIR_ITERATIONS} targeted repair iterations`,
  );
}

async function visualReview(
  context: QualityRunContext,
  role: 'visual-reviewer-physical' | 'visual-reviewer-design' | 'final-visual-reviewer',
  candidateDigest: Sha256Digest,
  pageManifest: unknown,
  popplerPages: string[],
  mupdfPages: string[],
  detailTiles: string[][],
): Promise<ReviewIssue[]> {
  const issues: ReviewIssue[] = [];
  for (let start = 0; start < popplerPages.length; start += VISUAL_REVIEW_PAGE_BATCH) {
    const end = Math.min(popplerPages.length, start + VISUAL_REVIEW_PAGE_BATCH);
    const imagePaths: string[] = [];
    const imageLabels: string[] = [];
    for (let index = start; index < end; index += 1) {
      imagePaths.push(popplerPages[index]!, mupdfPages[index]!, ...detailTiles[index]!);
      imageLabels.push(
        `page ${index + 1} full Poppler 300dpi`,
        `page ${index + 1} full MuPDF 300dpi`,
        ...detailTiles[index]!.map((_, tile) => `page ${index + 1} detail tile ${tile + 1}`),
      );
    }
    const call = await callRole(context, {
      role,
      userPayload: {
        candidateDigest,
        pages: { from: start + 1, to: end },
        pageManifest,
        imageLabels,
        instruction:
          'Inspect every supplied full-page image and every supplied detail tile. Do not sample.',
      },
      parser: qualityReviewOutputSchema,
      jsonSchema: QUALITY_REVIEW_JSON_SCHEMA,
      imagePaths,
    });
    issues.push(...reviewIssues(call.output, role, candidateDigest));
  }
  return issues;
}

function normalizeExtractedText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

async function assertPhysicalLimitations(
  workDir: string,
  evidence: ApprovedAuditEvidencePayload,
  language: ReportLanguage,
): Promise<void> {
  const extracted = normalizeExtractedText(
    await fs.readFile(path.join(workDir, 'extracted.txt'), 'utf8'),
  );
  for (const limitation of evidence.mandatoryDisclosures) {
    const expected = normalizeExtractedText(limitation.summary[language]);
    if (!extracted.includes(expected)) {
      throw new Error(
        `Report PDF QA failed: mandatory limitation ${limitation.limitationId} is absent from the exact ${language} PDF text layer`,
      );
    }
  }
}

interface RenderOutput {
  pdfDigest: Sha256Digest;
  key: string;
  pageCount: number;
}

function parseRenderOutput(value: unknown): RenderOutput {
  const output = value as Partial<RenderOutput> | null;
  if (
    !output ||
    typeof output.pdfDigest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(output.pdfDigest) ||
    typeof output.key !== 'string' ||
    typeof output.pageCount !== 'number' ||
    !Number.isInteger(output.pageCount) ||
    output.pageCount < 1
  )
    throw new Error('Render DAG record is malformed');
  return { pdfDigest: output.pdfDigest, key: output.key, pageCount: output.pageCount };
}

/** Renders and canonically post-processes one language candidate. Its
 *  bytes are stored content-addressed so a resumed run reviews the exact
 *  same candidate instead of a re-render with a new timestamp and id. */
async function renderCandidate(
  context: QualityRunContext,
  language: ReportLanguage,
  analysis: ReturnType<typeof resolveDraft>['analysis'],
  reportInputs: ReportOnlyInputs,
  workDir: string,
): Promise<RenderOutput> {
  const rendered = await generateReportPdf({
    auditDir: context.auditDir,
    manifest: context.manifest,
    findings: context.findings,
    renderMetadata: {
      reportId: randomUUID(),
      renderedAt: new Date(),
      rendererBuild: readOdysseusBuildId(),
      templateVersion: REPORT_TEMPLATE_VERSION,
    },
    analysis,
    ...(reportInputs.manualFields !== undefined ? { manualFields: reportInputs.manualFields } : {}),
    preparation: reportInputs.preparation[language],
    ...(reportInputs.gradeOverride !== undefined
      ? { gradeOverride: reportInputs.gradeOverride }
      : {}),
    ...(reportInputs.delta !== undefined ? { delta: reportInputs.delta } : {}),
    qualityLimitations: context.evidence.mandatoryDisclosures,
  });
  assertMandatoryDisclosures(
    context.evidence.mandatoryDisclosures,
    context.evidence.mandatoryDisclosures.map((item) => item.reportDestination),
  );
  const rawPath = path.join(workDir, 'chromium.pdf');
  const postPath = path.join(workDir, 'postprocessed.pdf');
  await fs.writeFile(rawPath, rendered.pdf);
  await canonicalPostProcessPdf(
    rawPath,
    postPath,
    language,
    language === 'fr' ? "Rapport d'audit Odysseus" : 'Odysseus audit report',
  );
  const stored = await context.dag.putBytes('candidate-pdf', await fs.readFile(postPath));
  return { pdfDigest: stored.digest, key: stored.key, pageCount: rendered.pageCount };
}

async function renderAndReviewLanguage(
  context: QualityRunContext,
  language: ReportLanguage,
  draft: QualityWriterOutput,
  plan: SeniorReportPlan,
  registry: ReportFactRegistry,
  snapshotDigest: Sha256Digest,
  reportInputs: ReportOnlyInputs,
): Promise<QualityLanguageCandidateResult> {
  const resolved = resolveDraft(context, language, draft, plan, registry, reportInputs);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `odysseus-058-${language}-`));
  try {
    const finalPath = path.join(workDir, 'candidate.pdf');
    const render = await context.dag.run(
      `render-${language}`,
      {
        ...context.renderParents,
        language,
        draftDigest: reportQualityDigest(draft),
        planDigest: reportQualityDigest(modelPlan(plan)),
        registryDigest: reportQualityDigest(modelRegistry(registry)),
        reportOnlyInputsDigest: reportQualityDigest(reportInputs),
      },
      async () => ({
        output: await renderCandidate(context, language, resolved.analysis, reportInputs, workDir),
      }),
      parseRenderOutput,
    );
    await fs.writeFile(
      finalPath,
      await context.dag.getBytes(render.output.key, render.output.pdfDigest),
    );

    const qa = await runExactPdfQa({
      pdfPath: finalPath,
      workDir: path.join(workDir, 'qa'),
      expectedPageCount: render.output.pageCount,
    });
    await assertPhysicalLimitations(path.join(workDir, 'qa'), context.evidence, language);
    // Exact-PDF QA is always recomputed; a different result for the same
    // candidate, tools and code is nondeterminism and fails the run.
    await context.dag.assertDeterministic(
      `pdf-qa-${language}`,
      { ...context.renderParents, pdfDigest: render.output.pdfDigest },
      {
        pdfDigest: qa.pdfDigest,
        pageCount: qa.pageCount,
        extractedTextDigest: qa.extractedTextDigest,
        gateDigest: qa.gateDigest,
      },
    );

    const pageManifest = {
      candidateDigest: qa.pdfDigest,
      pages: Array.from({ length: qa.pageCount }, (_, index) => ({
        pageNumber: index + 1,
        popplerRaster: path.basename(qa.popplerPages[index]!),
        mupdfRaster: path.basename(qa.mupdfPages[index]!),
        tileIds: qa.detailTiles[index]!.map((tile) => path.basename(tile)),
      })),
    };
    const pageManifestObject = await putImmutableJson(
      context.artifactStore,
      `page-manifest-${language}`,
      pageManifest,
    );
    const qaObject = await putImmutableJson(context.artifactStore, `pdf-qa-${language}`, {
      pdfDigest: qa.pdfDigest,
      pageCount: qa.pageCount,
      pageWidthPt: qa.pageWidthPt,
      pageHeightPt: qa.pageHeightPt,
      extractedTextDigest: qa.extractedTextDigest,
      gateDigest: qa.gateDigest,
      coverage: qa.coverage,
      toolVersions: qa.toolVersions,
    });

    const firstPassIssues = [
      ...(await visualReview(
        context,
        'visual-reviewer-physical',
        qa.pdfDigest,
        pageManifest,
        qa.popplerPages,
        qa.mupdfPages,
        qa.detailTiles,
      )),
      ...(await visualReview(
        context,
        'visual-reviewer-design',
        qa.pdfDigest,
        pageManifest,
        qa.popplerPages,
        qa.mupdfPages,
        qa.detailTiles,
      )),
    ];
    const adjudicated = await adjudicateIssues(context, firstPassIssues, {
      candidateDigest: qa.pdfDigest,
      pageManifest,
      qaDigest: qa.gateDigest,
    });
    const visualUnsure = materialUnsure(adjudicated);
    const visualDefects = acceptedObjective(adjudicated);
    await recordReviewIssues(context, adjudicated);
    if (visualUnsure.length > 0 || visualDefects.length > 0) {
      throw new ReportQualityNeedsOperatorReviewError(
        visualUnsure.length > 0 ? 'visual-review-unsure' : 'visual-defect',
        `Visual candidate requires targeted layout/template ownership before rerender: ${[
          ...visualUnsure,
          ...visualDefects,
        ]
          .map((issue) => `${issue.issueId}:${issue.repairRoute}`)
          .join(', ')}`,
      );
    }

    const finalIssues = await visualReview(
      context,
      'final-visual-reviewer',
      qa.pdfDigest,
      pageManifest,
      qa.popplerPages,
      qa.mupdfPages,
      qa.detailTiles,
    );
    const finalAdjudicated = await adjudicateIssues(context, finalIssues, {
      candidateDigest: qa.pdfDigest,
      pageManifest,
      qaDigest: qa.gateDigest,
    });
    await recordReviewIssues(context, finalAdjudicated);
    if (
      acceptedObjective(finalAdjudicated).length > 0 ||
      materialUnsure(finalAdjudicated).length > 0
    ) {
      throw new ReportQualityNeedsOperatorReviewError(
        'final-visual-review',
        'Fresh final visual review found an objective or materially unsure defect',
      );
    }

    const pdf = await fs.readFile(finalPath);
    if (bytesDigest(pdf) !== qa.pdfDigest) {
      throw new Error('Report quality aborted: candidate bytes changed after exact PDF QA');
    }
    const candidate = await putPrivateCandidatePdf(context.artifactStore, {
      auditId: context.manifest.auditId,
      qualityRunId: context.lease.qualityRunId,
      language,
      pdf,
    });
    if (candidate.digest !== qa.pdfDigest) {
      throw new Error(
        'Report quality aborted: private candidate digest differs from reviewed bytes',
      );
    }
    await transitionReportQualityRun(
      context.connection,
      context.manifest.auditId,
      context.lease,
      language === 'fr' ? 'fr-candidate-clean' : 'en-candidate-clean',
      { candidateDigest: qa.pdfDigest },
    );
    context.state = language === 'fr' ? 'fr-candidate-clean' : 'en-candidate-clean';

    return {
      language,
      pdfDigest: qa.pdfDigest,
      privateObjectKey: candidate.key,
      pageCount: qa.pageCount,
      qaDigest: qaObject.digest,
      pageManifestDigest: pageManifestObject.digest,
      draftDigest: resolved.draftDigest,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function arbiterCandidateView(candidate: QualityLanguageCandidateResult) {
  return {
    language: candidate.language,
    pdfDigest: candidate.pdfDigest,
    pageCount: candidate.pageCount,
    qaDigest: candidate.qaDigest,
    pageManifestDigest: candidate.pageManifestDigest,
  };
}

async function assertParity(
  context: QualityRunContext,
  plan: SeniorReportPlan,
  registry: ReportFactRegistry,
  fr: QualityWriterOutput,
  en: QualityWriterOutput,
): Promise<Sha256Digest> {
  const artifactDigest = reportQualityDigest({
    plan: modelPlan(plan),
    fr,
    en,
    registry: modelRegistry(registry),
  });
  const call = await callRole(context, {
    role: 'parity-reviewer',
    userPayload: {
      seniorPlan: modelPlan(plan),
      factRegistry: modelRegistry(registry),
      mandatoryDisclosures: context.evidence.mandatoryDisclosures,
      fr,
      en,
    },
    parser: qualityReviewOutputSchema,
    jsonSchema: QUALITY_REVIEW_JSON_SCHEMA,
  });
  const issues = reviewIssues(call.output, 'parity-reviewer', artifactDigest);
  const adjudicated = await adjudicateIssues(context, issues, {
    seniorPlan: modelPlan(plan),
    factRegistry: modelRegistry(registry),
    mandatoryDisclosures: context.evidence.mandatoryDisclosures,
    fr,
    en,
  });
  if (acceptedObjective(adjudicated).length > 0 || materialUnsure(adjudicated).length > 0) {
    throw new ReportQualityNeedsOperatorReviewError(
      'bilingual-parity',
      'French/English parity review found an objective or materially unsure defect',
    );
  }
  return reportQualityDigest({ artifactDigest, adjudicated });
}

export async function runReportQualityPipeline(input: {
  connection: Connection;
  auditDir: string;
  manifest: AuditManifest;
  findings: Finding[];
  artifactStore: ArtifactStore | undefined;
  approvedEvidence?: ApprovedAuditEvidencePayload;
  /** Plan 058 §15 resume: reuse DAG nodes whose declared parents all match.
   *  Off for §19 stability runs, which must pay every call fresh. */
  dagReuse?: boolean;
  /** `replay-only` never calls a provider: a node without a matching record
   *  stops the run, and a replay never produces a qualifying bundle. */
  modelMode?: ReportQualityModelMode;
}): Promise<ReportQualityPipelineResult> {
  if (!input.artifactStore) {
    throw new Error(
      'Plan 058 report quality requires the configured private artifact store; local-disk-only candidates cannot be approved or promoted',
    );
  }

  const lease = await acquireReportQualityLease(input.connection, input.manifest.auditId);
  const evidence = input.approvedEvidence ?? loadAuditEvidencePayload(input);
  const context: QualityRunContext = {
    connection: input.connection,
    auditDir: input.auditDir,
    manifest: input.manifest,
    findings: input.findings,
    artifactStore: input.artifactStore,
    evidence,
    lease,
    dag: new ReportQualityDag(input.artifactStore, {
      reuse: input.dagReuse ?? true,
      mode: input.modelMode ?? 'live',
    }),
    renderParents: {},
    state: 'running',
  };

  await startReportQualityRun(input.connection, input.manifest.auditId, lease);
  try {
    if (context.dag.mode === 'replay-only')
      await transitionReportQualityRun(input.connection, input.manifest.auditId, lease, 'running', {
        modelMode: 'replay-only',
      });
    const reportInputs = await buildReportOnlyInputs(
      input.connection,
      input.manifest,
      input.findings,
    );
    const renderer = await reportRendererAssetFingerprints();
    const qualityTools = await preflightPdfQualityToolchain();
    const qualityToolFingerprint = reportQualityDigest({
      qualityTools,
      divergenceThreshold: process.env['ODYSSEUS_PDF_RENDER_DIVERGENCE_MAX_RATIO'] ?? null,
    });
    context.renderParents = {
      templateVersion: REPORT_TEMPLATE_VERSION,
      rendererBuild: readOdysseusBuildId(),
      rendererAssets: renderer.rendererAssets,
      fonts: renderer.fonts,
      rendererCode: await reportRendererCodeFingerprint(),
      qualityToolFingerprint,
      manifestDigest: reportQualityDigest(input.manifest),
      findingsDigest: reportQualityDigest(input.findings),
      mandatoryDisclosuresDigest: reportQualityDigest(evidence.mandatoryDisclosures),
    };
    const approvedEvidenceDigest = reportQualityDigest(evidence.approval);
    const reportOnlyInputsDigest = reportQualityDigest(reportInputs);
    const referenceRegistryDigest = reportQualityDigest({
      version: '058-v1',
      references: [],
      note: 'model-authored references are disabled; deterministic report references remain template-owned',
    });
    const snapshot: ReportInputSnapshot = {
      snapshotVersion: '058-v1',
      auditId: input.manifest.auditId,
      approvedEvidenceDigest,
      evidenceQualityAssessmentDigest: evidence.approval.evidenceQualityAssessmentDigest,
      auditIdentityDigest: reportQualityDigest({
        siteUrl: input.manifest.siteUrl,
        manualIdentity: reportInputs.manualFields,
      }),
      reportOnlyInputsDigest,
      referenceRegistryDigest,
      reportTemplateVersion: REPORT_TEMPLATE_VERSION,
      rendererBuild: readOdysseusBuildId(),
      rendererFingerprint: renderer.rendererAssets,
      fontFingerprint: renderer.fonts,
      modelProfileDigest: getReportModelProfileMatrixDigest(),
      qualityToolFingerprint,
      requestedLanguages: ['fr', 'en'],
      createdAt: new Date().toISOString(),
    };
    const snapshotObject = await putImmutableJson(input.artifactStore, 'input-snapshot', snapshot);
    await transitionReportQualityRun(input.connection, input.manifest.auditId, lease, 'running', {
      inputSnapshotDigest: snapshotObject.digest,
      approvedEvidenceDigest,
    });

    const registry = buildReportFactRegistry(evidence, snapshot, reportInputs);
    const dossier = buildReportEvidenceDossier(evidence, snapshot);
    await putImmutableJson(input.artifactStore, 'fact-registry', registry);
    await putImmutableJson(input.artifactStore, 'evidence-dossier', dossier);

    await keepLease(context);
    let plan: SeniorReportPlan | undefined;
    const planRejections: string[] = [];
    for (let attempt = 1; !plan; attempt += 1) {
      const planCall = await callRole(context, {
        role: 'senior-analyst',
        userPayload: {
          evidence: compactEvidence(evidence),
          dossier: modelDossier(dossier),
          factRegistry: modelRegistry(registry),
          instruction:
            'Account for every non-minor finding in exactly one coherent remediation project; ' +
            'minor findings may remain appendix-only. There is no target project count. ' +
            'Every evidenceRefs entry must be copied verbatim from the supplied evidence ' +
            'universe: a findingId, a dossier packet packetId, a packet representativeEvidenceRefs ' +
            'entry, or a pattern patternId. Every factRefs entry must be a factId from the ' +
            'factRegistry. Never invent URLs, page addresses or digests — any reference outside ' +
            'these sets is rejected deterministically.',
          ...(planRejections.length > 0
            ? {
                previousAttemptRejections: planRejections,
                repairInstruction:
                  'Your previous plan was refused by the deterministic evidence-binding gates. ' +
                  'Repair exactly the named rejections — replace or drop unknown references — ' +
                  'and keep every other field identical.',
              }
            : {}),
        },
        parser: seniorPlanOutputSchema,
        jsonSchema: SENIOR_PLAN_JSON_SCHEMA,
      });
      const candidate = normalizeSeniorPlan(planCall.output, snapshotObject.digest);
      try {
        assertPlanBindings(candidate, registry, evidence, dossier);
        plan = candidate;
      } catch (error) {
        planRejections.push(error instanceof Error ? error.message : String(error));
        if (attempt >= MAX_PLAN_ATTEMPTS) {
          // Plan 058 §13: exhausting the ceiling is operator review, never
          // a silently accepted plan.
          throw new ReportQualityNeedsOperatorReviewError(
            'plan-repair-limit',
            `Senior report plan failed its binding gates after ${String(MAX_PLAN_ATTEMPTS)} attempts: ${planRejections.join(' | ')}`,
          );
        }
      }
    }
    const coverage = reconcileCoverageLedger(dossier.coverageLedger, plan);
    assertCoverageLedgerComplete(coverage);
    const planObject = await putImmutableJson(input.artifactStore, 'senior-plan', {
      plan,
      coverage,
    });

    const cleanedWriters = {} as Record<ReportLanguage, QualityWriterOutput>;
    for (const language of ['fr', 'en'] as const) {
      let writerCall = await callRole(context, {
        role: language === 'fr' ? 'writer-fr' : 'writer-en',
        userPayload: {
          language,
          seniorPlan: modelPlan(plan),
          // The findings themselves: a plan names finding ids, and concrete
          // developer actions need what each finding is and where it occurs.
          evidence: compactEvidence(evidence),
          evidenceDossier: modelDossier(dossier),
          factRegistry: modelRegistry(registry),
          mandatoryDisclosures: evidence.mandatoryDisclosures,
          writingRules: WRITING_RULES,
        },
        parser: qualityWriterOutputSchema,
        jsonSchema: QUALITY_WRITER_JSON_SCHEMA,
      });
      // Plan 058 §9 patch-prose: a writer draft that fails the evidence-
      // binding gates is re-issued with every deterministic rejection named,
      // accumulating across a bounded attempt ceiling (§13); exhausting it
      // goes to operator review, never a silently accepted draft.
      const bindableWriterDraft = (): void => {
        resolveDraft(context, language, writerCall.output, plan, registry, reportInputs);
      };
      const writerRejections: string[] = [];
      for (let attempt = 1; ; attempt += 1) {
        try {
          bindableWriterDraft();
          break;
        } catch (error) {
          writerRejections.push(error instanceof Error ? error.message : String(error));
          if (attempt >= MAX_WRITER_ATTEMPTS) {
            throw new ReportQualityNeedsOperatorReviewError(
              'writer-repair-limit',
              `Writer draft failed its evidence-binding gates after ${String(attempt)} attempts: ${writerRejections.join(' | ')}`,
            );
          }
          writerCall = await callRole(context, {
            role: language === 'fr' ? 'writer-fr' : 'writer-en',
            userPayload: {
              language,
              seniorPlan: modelPlan(plan),
              evidence: compactEvidence(evidence),
              evidenceDossier: modelDossier(dossier),
              factRegistry: modelRegistry(registry),
              mandatoryDisclosures: evidence.mandatoryDisclosures,
              writingRules: WRITING_RULES,
              previousDraftRejections: writerRejections,
              repairInstruction:
                'Your previous draft was refused by the deterministic evidence-binding gates. ' +
                'Repair exactly the named rejections — move exact scalars into fact segments, ' +
                'reword causality into evidence-bounded impact, fix lab/field and Core Web Vitals ' +
                'taxonomy, keep comparability wording — and keep every other field identical.',
            },
            parser: qualityWriterOutputSchema,
            jsonSchema: QUALITY_WRITER_JSON_SCHEMA,
          });
        }
      }
      cleanedWriters[language] = await cleanContentDraft(
        context,
        language,
        writerCall.output,
        plan,
        registry,
        snapshotObject.digest,
        reportInputs,
      );
    }

    await transitionReportQualityRun(
      input.connection,
      input.manifest.auditId,
      lease,
      'content-clean',
    );
    context.state = 'content-clean';

    const parityDigest = await assertParity(
      context,
      plan,
      registry,
      cleanedWriters.fr,
      cleanedWriters.en,
    );
    await transitionReportQualityRun(
      input.connection,
      input.manifest.auditId,
      lease,
      'parity-clean',
    );
    context.state = 'parity-clean';

    const fr = await renderAndReviewLanguage(
      context,
      'fr',
      cleanedWriters.fr,
      plan,
      registry,
      snapshotObject.digest,
      reportInputs,
    );
    const en = await renderAndReviewLanguage(
      context,
      'en',
      cleanedWriters.en,
      plan,
      registry,
      snapshotObject.digest,
      reportInputs,
    );

    context.state = 'bundle-final-review';
    await transitionReportQualityRun(
      input.connection,
      input.manifest.auditId,
      lease,
      'bundle-final-review',
    );
    const arbiterCall = await callRole(context, {
      role: 'final-document-arbiter',
      // Content identities only: the snapshot, evidence approval and private
      // object keys are run lineage that code binds into the bundle below;
      // as opaque run-scoped digests they give the arbiter nothing to judge
      // and would make this node unique to one run.
      userPayload: {
        seniorPlanDigest: reportQualityDigest(modelPlan(plan)),
        parityDigest,
        fr: arbiterCandidateView(fr),
        en: arbiterCandidateView(en),
        deterministicGates: {
          frPdfQa: fr.qaDigest,
          enPdfQa: en.qaDigest,
          frPageManifest: fr.pageManifestDigest,
          enPageManifest: en.pageManifestDigest,
        },
        mandatoryDisclosures: evidence.mandatoryDisclosures,
        instruction:
          'Approve only the exact bilingual bundle described here. Any objective defect, including a minor one, means approved=false.',
      },
      parser: finalArbiterOutputSchema,
      jsonSchema: FINAL_ARBITER_JSON_SCHEMA,
    });
    const finalIssues = reviewIssues(
      { issues: arbiterCall.output.issues },
      'final-document-arbiter',
      reportQualityDigest({ fr, en, parityDigest }),
    );
    if (
      !arbiterCall.output.approved ||
      finalIssues.some((issue) => issue.kind === 'objective-defect')
    ) {
      throw new ReportQualityNeedsOperatorReviewError(
        'final-arbiter',
        'Final document arbiter did not approve the exact bilingual bundle',
      );
    }
    if (context.dag.mode === 'replay-only') {
      // Replay proves the recorded stages still pass today's deterministic
      // gates; it never stands in for a live, qualifying run.
      throw new ReportQualityReplayCompleteError();
    }
    const finalArbiterVerdictDigest = reportQualityDigest(arbiterCall.output);
    const bundleId = randomUUID();
    const candidateWithoutDigest = {
      qualityRunId: lease.qualityRunId,
      epoch: lease.epoch,
      inputSnapshotDigest: snapshotObject.digest,
      approvedEvidenceDigest,
      seniorPlanDigest: planObject.digest,
      frCandidateDigest: fr.pdfDigest,
      enCandidateDigest: en.pdfDigest,
      parityVerdictDigest: parityDigest,
      finalArbiterVerdictDigest,
      bundleManifestDigest: reportQualityDigest({
        fr,
        en,
        snapshot: snapshotObject.digest,
        evidence: approvedEvidenceDigest,
      }),
      state: 'quality-approved' as const,
    };
    const bundleDigest = reportQualityDigest(candidateWithoutDigest);
    const bundle: ReportBundleCandidate = {
      ...candidateWithoutDigest,
      bundleDigest,
    };
    await putImmutableJson(input.artifactStore, 'bundle-manifest', {
      bundleId,
      bundle,
      fr,
      en,
      evidenceApprovalMode: evidence.approval.approvalMode,
    });

    await transitionReportQualityRun(
      input.connection,
      input.manifest.auditId,
      lease,
      'quality-approved',
      { candidateDigest: bundleDigest },
    );
    await recordQualityApprovedBundle(input.connection, {
      bundleId,
      qualityRunId: lease.qualityRunId,
      auditId: input.manifest.auditId,
      epoch: lease.epoch,
      bundleDigest,
      inputSnapshotDigest: snapshotObject.digest,
      approvedEvidenceDigest,
      evidenceApprovalMode: evidence.approval.approvalMode,
      fr: {
        pdfDigest: fr.pdfDigest,
        privateObjectKey: fr.privateObjectKey,
        pageCount: fr.pageCount,
      },
      en: {
        pdfDigest: en.pdfDigest,
        privateObjectKey: en.privateObjectKey,
        pageCount: en.pageCount,
      },
    });
    await transitionReportQualityRun(
      input.connection,
      input.manifest.auditId,
      lease,
      'awaiting-operator-approval',
    );

    return {
      qualityRunId: lease.qualityRunId,
      epoch: lease.epoch,
      state: 'awaiting-operator-approval',
      bundleId,
      bundleDigest,
      inputSnapshotDigest: snapshotObject.digest,
      evidenceApprovalMode: evidence.approval.approvalMode,
      fr,
      en,
    };
  } catch (error) {
    const state =
      error instanceof ReportQualityNeedsOperatorReviewError ? 'needs-operator-review' : 'failed';
    try {
      await transitionReportQualityRun(input.connection, input.manifest.auditId, lease, state, {
        errorCode:
          error instanceof ReportQualityNeedsOperatorReviewError ||
          error instanceof ReportQualityReplayCompleteError
            ? error.reasonCode
            : error instanceof ReportQualityReplayMissError
              ? 'replay-miss'
              : 'report-quality-failed',
      });
    } catch {
      // A lost lease is itself the authority to discard this worker's late result.
    }
    throw error;
  } finally {
    await releaseReportQualityLease(input.connection, input.manifest.auditId, lease);
  }
}
