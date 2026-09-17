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
  type ReportFactRegistry,
  type ReportInputSnapshot,
  type ReportLanguage,
  type ReportOnlyInputs,
  type ReviewIssue,
  type SeniorReportPlan,
  type Sha256Digest,
} from '@odysseus/core';
import {
  ADJUDICATION_JSON_SCHEMA,
  EDITOR_JSON_SCHEMA,
  FINAL_ARBITER_JSON_SCHEMA,
  QUALITY_REVIEW_JSON_SCHEMA,
  QUALITY_WRITER_JSON_SCHEMA,
  SENIOR_PLAN_JSON_SCHEMA,
  callReportQualityRole,
  editorOutputSchema,
  finalArbiterOutputSchema,
  getReportQualityModel,
  issueAdjudicationOutputSchema,
  qualityReviewOutputSchema,
  qualityWriterOutputSchema,
  seniorPlanOutputSchema,
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
  runExactPdfQa,
} from '@odysseus/report';
import { readOdysseusBuildId } from '@odysseus/scanner';
import {
  acquireReportQualityLease,
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
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { runObligationStage } from './obligation-stage.js';
import { adaptLegacyAuditEvidence } from './report-quality-evidence.js';
import {
  applyTargetedWriterPatches,
  resolveQualityDraft,
  validateQualityWriterOutput,
} from './report-quality-draft.js';
import {
  putImmutableJson,
  putPrivateCandidatePdf,
} from './report-quality-storage.js';

const MAX_CONTENT_REPAIR_ITERATIONS = 8;
const VISUAL_REVIEW_PAGE_BATCH = 1;

export class ReportQualityNeedsOperatorReviewError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.name = 'ReportQualityNeedsOperatorReviewError';
    this.reasonCode = reasonCode;
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
  state: 'running' | 'content-clean' | 'fr-candidate-clean' | 'en-candidate-clean' | 'parity-clean' | 'bundle-final-review';
}

async function recordModelCall(
  context: QualityRunContext,
  provenance: Parameters<typeof transitionReportQualityRun>[4]['modelCall'],
): Promise<void> {
  await transitionReportQualityRun(
    context.connection,
    context.manifest.auditId,
    context.lease,
    context.state,
    { modelCall: provenance },
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
  return {
    approval: evidence.approval,
    findings: evidence.findings.map((finding) => ({
      findingId: finding.findingId,
      ruleId: finding.ruleId,
      category: finding.category,
      severity: finding.severity,
      wcagCriteria: finding.wcagCriteria,
      title: finding.title,
      description: finding.description,
      pageUrls: finding.pageUrls,
      occurrences: finding.occurrences,
    })),
    patternEvidence: evidence.patternEvidence ?? [],
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
      ...(project.likelyRootCause
        ? { likelyRootCause: project.likelyRootCause }
        : {}),
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
    ...dossier.packets.flatMap((packet) => [
      packet.packetId,
      ...packet.representativeEvidenceRefs,
    ]),
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
  await keepLease(context);
  const call = await callReportQualityRole({
    role: 'issue-adjudicator',
    userPayload: { issues, evidence },
    parser: issueAdjudicationOutputSchema,
    jsonSchema: ADJUDICATION_JSON_SCHEMA,
  });
  await recordModelCall(context, call.provenance);
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
  return issues.filter(
    (issue) => issue.kind === 'objective-defect' && issue.status === 'accepted',
  );
}

function materialUnsure(issues: readonly ReviewIssue[]): ReviewIssue[] {
  return issues.filter(
    (issue) =>
      issue.status === 'unsure' &&
      (issue.severity === 'blocking' || issue.severity === 'major'),
  );
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
    const artifact = await putImmutableJson(
      context.artifactStore,
      `draft-${language}`,
      { snapshotDigest, language, draft },
    );
    const resolved = resolveQualityDraft({
      language,
      writer: draft,
      plan,
      registry,
      evidence: context.evidence,
      requestedModel: getReportQualityModel(),
      generatedAt: new Date(),
      ...(reportInputs.obligationAssessment !== undefined
        ? { obligationAssessment: reportInputs.obligationAssessment }
        : {}),
    });

    const issues: ReviewIssue[] = [];
    for (const role of ['content-critic-evidence', 'content-critic-editorial'] as const) {
      await keepLease(context);
      const call = await callReportQualityRole({
        role,
        userPayload: {
          language,
          seniorPlan: plan,
          factRegistry: registry,
          evidence: compactEvidence(context.evidence),
          structuredDraft: draft,
          resolvedDraft: {
            executiveSummary: resolved.analysis.executiveSummary,
            notes: resolved.analysis.notes,
            themes: resolved.analysis.themes,
          },
        },
        parser: qualityReviewOutputSchema,
        jsonSchema: QUALITY_REVIEW_JSON_SCHEMA,
      });
      await recordModelCall(context, call.provenance);
      issues.push(...reviewIssues(call.output, role, artifact.digest));
    }

    const adjudicated = await adjudicateIssues(context, issues, {
      factRegistry: registry,
      evidence: compactEvidence(context.evidence),
      seniorPlan: plan,
    });
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

    await keepLease(context);
    const edit = await callReportQualityRole({
      role: 'editor',
      userPayload: {
        language,
        acceptedIssues: defects,
        currentDraft: draft,
        factRegistry: registry,
        seniorPlan: plan,
        instruction:
          'Patch only the accepted semantic targets. Preserve every other field byte-for-byte.',
      },
      parser: editorOutputSchema,
      jsonSchema: EDITOR_JSON_SCHEMA,
    });
    await recordModelCall(context, edit.provenance);
    draft = applyTargetedWriterPatches(
      draft,
      edit.output,
      new Set(defects.map((issue) => issue.issueId)),
    );
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
    await keepLease(context);
    const call = await callReportQualityRole({
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
    await recordModelCall(context, call.provenance);
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
  const extracted = normalizeExtractedText(await fs.readFile(path.join(workDir, 'extracted.txt'), 'utf8'));
  for (const limitation of evidence.mandatoryDisclosures) {
    const expected = normalizeExtractedText(limitation.summary[language]);
    if (!extracted.includes(expected)) {
      throw new Error(
        `Report PDF QA failed: mandatory limitation ${limitation.limitationId} is absent from the exact ${language} PDF text layer`,
      );
    }
  }
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
  const resolved = resolveQualityDraft({
    language,
    writer: draft,
    plan,
    registry,
    evidence: context.evidence,
    requestedModel: getReportQualityModel(),
    generatedAt: new Date(),
    ...(reportInputs.obligationAssessment !== undefined
      ? { obligationAssessment: reportInputs.obligationAssessment }
      : {}),
  });
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `odysseus-058-${language}-`));
  try {
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
      analysis: resolved.analysis,
      ...(reportInputs.manualFields !== undefined
        ? { manualFields: reportInputs.manualFields }
        : {}),
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
    const finalPath = path.join(workDir, 'candidate.pdf');
    await fs.writeFile(rawPath, rendered.pdf);
    await canonicalPostProcessPdf(
      rawPath,
      finalPath,
      language,
      language === 'fr' ? "Rapport d'audit Odysseus" : 'Odysseus audit report',
    );

    const qa = await runExactPdfQa({
      pdfPath: finalPath,
      workDir: path.join(workDir, 'qa'),
      expectedPageCount: rendered.pageCount,
    });
    await assertPhysicalLimitations(path.join(workDir, 'qa'), context.evidence, language);

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
      throw new Error('Report quality aborted: private candidate digest differs from reviewed bytes');
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

async function assertParity(
  context: QualityRunContext,
  plan: SeniorReportPlan,
  registry: ReportFactRegistry,
  fr: QualityWriterOutput,
  en: QualityWriterOutput,
): Promise<Sha256Digest> {
  const artifactDigest = reportQualityDigest({ plan, fr, en, registry });
  await keepLease(context);
  const call = await callReportQualityRole({
    role: 'parity-reviewer',
    userPayload: {
      seniorPlan: plan,
      factRegistry: registry,
      mandatoryDisclosures: context.evidence.mandatoryDisclosures,
      fr,
      en,
    },
    parser: qualityReviewOutputSchema,
    jsonSchema: QUALITY_REVIEW_JSON_SCHEMA,
  });
  await recordModelCall(context, call.provenance);
  const issues = reviewIssues(call.output, 'parity-reviewer', artifactDigest);
  const adjudicated = await adjudicateIssues(context, issues, {
    seniorPlan: plan,
    factRegistry: registry,
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
}): Promise<ReportQualityPipelineResult> {
  if (!input.artifactStore) {
    throw new Error(
      'Plan 058 report quality requires the configured private artifact store; local-disk-only candidates cannot be approved or promoted',
    );
  }

  const lease = await acquireReportQualityLease(input.connection, input.manifest.auditId);
  const evidence =
    input.approvedEvidence ??
    adaptLegacyAuditEvidence({ manifest: input.manifest, findings: input.findings });
  const context: QualityRunContext = {
    connection: input.connection,
    auditDir: input.auditDir,
    manifest: input.manifest,
    findings: input.findings,
    artifactStore: input.artifactStore,
    evidence,
    lease,
    state: 'running',
  };

  await startReportQualityRun(input.connection, input.manifest.auditId, lease);
  try {
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
    const model = getReportQualityModel();
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
      modelProfileDigest: reportQualityDigest({
        model,
        reasoningEffort: 'high',
        roleContract: '058-v1',
      }),
      qualityToolFingerprint,
      requestedLanguages: ['fr', 'en'],
      createdAt: new Date().toISOString(),
    };
    const snapshotObject = await putImmutableJson(input.artifactStore, 'input-snapshot', snapshot);
    await transitionReportQualityRun(
      input.connection,
      input.manifest.auditId,
      lease,
      'running',
      {
        inputSnapshotDigest: snapshotObject.digest,
        approvedEvidenceDigest,
      },
    );

    const registry = buildReportFactRegistry(evidence, snapshot, reportInputs);
    const dossier = buildReportEvidenceDossier(evidence, snapshot);
    await putImmutableJson(input.artifactStore, 'fact-registry', registry);
    await putImmutableJson(input.artifactStore, 'evidence-dossier', dossier);

    await keepLease(context);
    const planCall = await callReportQualityRole({
      role: 'senior-analyst',
      userPayload: {
        inputSnapshotDigest: snapshotObject.digest,
        evidence: compactEvidence(evidence),
        dossier,
        factRegistry: registry,
        instruction:
          'Account for every non-minor finding in exactly one coherent remediation project; minor findings may remain appendix-only. There is no target project count.',
      },
      parser: seniorPlanOutputSchema,
      jsonSchema: SENIOR_PLAN_JSON_SCHEMA,
    });
    await recordModelCall(context, planCall.provenance);
    const plan = normalizeSeniorPlan(planCall.output, snapshotObject.digest);
    assertPlanBindings(plan, registry, evidence, dossier);
    const coverage = reconcileCoverageLedger(dossier.coverageLedger, plan);
    assertCoverageLedgerComplete(coverage);
    const planObject = await putImmutableJson(input.artifactStore, 'senior-plan', {
      plan,
      coverage,
    });

    const cleanedWriters = {} as Record<ReportLanguage, QualityWriterOutput>;
    for (const language of ['fr', 'en'] as const) {
      await keepLease(context);
      const writerCall = await callReportQualityRole({
        role: language === 'fr' ? 'writer-fr' : 'writer-en',
        userPayload: {
          inputSnapshotDigest: snapshotObject.digest,
          language,
          seniorPlan: plan,
          evidenceDossier: dossier,
          factRegistry: registry,
          mandatoryDisclosures: evidence.mandatoryDisclosures,
        },
        parser: qualityWriterOutputSchema,
        jsonSchema: QUALITY_WRITER_JSON_SCHEMA,
      });
      await recordModelCall(context, writerCall.provenance);
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
    await keepLease(context);
    const arbiterCall = await callReportQualityRole({
      role: 'final-document-arbiter',
      userPayload: {
        inputSnapshotDigest: snapshotObject.digest,
        approvedEvidenceDigest,
        seniorPlanDigest: planObject.digest,
        parityDigest,
        fr,
        en,
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
    await recordModelCall(context, arbiterCall.provenance);
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
      error instanceof ReportQualityNeedsOperatorReviewError
        ? 'needs-operator-review'
        : 'failed';
    try {
      await transitionReportQualityRun(
        input.connection,
        input.manifest.auditId,
        lease,
        state,
        {
          errorCode:
            error instanceof ReportQualityNeedsOperatorReviewError
              ? error.reasonCode
              : 'report-quality-failed',
        },
      );
    } catch {
      // A lost lease is itself the authority to discard this worker's late result.
    }
    throw error;
  } finally {
    await releaseReportQualityLease(input.connection, input.manifest.auditId, lease);
  }
}
