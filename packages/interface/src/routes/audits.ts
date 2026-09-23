import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { hostname as osHostname } from 'node:os';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  buildFindingsProvenance,
  canonicalDigest,
  isGrade,
  isValidSiren,
  summarizeAuditCoverage,
  type AuditManifest,
  type AuditManualFields,
  type Finding,
  type FindingsProvenance,
  type ReportLanguage,
  type ReportTheme,
  type StatSector,
} from '@odysseus/core';
import {
  clearAuditGradeOverride,
  createJobModel,
  createReportQualityRunModel,
  getAudit,
  getAuditManualFields,
  getAuditRuntimeFields,
  getFindingsForAudit,
  getActiveReportBundle,
  getLatestReportBundle,
  getLatestReportQualityRun as getLatestReportQualityRunSummary,
  getReportBundleByDigest,
  getLatestFinalizedReport,
  getLatestGeneratedReport,
  getLatestReport,
  getLatestReportApproval,
  getSeverityRollup,
  getProspectHub,
  approvalCoversReport,
  approvalMatchesReportPair,
  listOutreachPreviews,
  listReportLanguages,
  persistReport,
  persistReportApproval,
  reportOrigin,
  resolveReportVariant,
  resolveSelectedAnalysisPairForAudit,
  saveLinkedAuditIdentity,
  setAuditGradeOverride,
  setAuditManualFields,
  type ActiveReportBundleDocument,
  type AuditDocumentFields,
  type AuditIdentityValues,
  type JobDocument,
  type ReportBundleDocument,
  type ReportDocument,
  type ReportQualityRunDocument,
  type SelectedAuditAnalysisPairResolution,
} from '@odysseus/store';
import {
  buildArtifactBucketKey,
  buildAuditDir,
  getArtifactsRoot,
  hasAssessedEvidenceGraph,
  readOdysseusBuildId,
} from '@odysseus/scanner';
import {
  classifyReportFreshness,
  reportUsesCurrentTemplate,
  buildRenderBundle,
  computeAutomaticGrade,
  summarizeThirdPartyFindings,
  findUnconfirmedIdentityFields,
  generateOutreachPreviewHtmlV3,
  generateOutreachPreviewPdf,
  remediationFor,
  resolveEffectiveGrade,
  RULE_TRANSLATIONS_FR,
  type ReportFreshness,
} from '@odysseus/report';
import { getPreviewPublicBaseUrl } from '../config.js';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { createMongoOutreachPreviewStoreV3 } from '../outreach/mongo-outreach-preview-store-v2.js';
import {
  buildOutreachPreviewSummaryV3,
  publishPreviewV3,
  type PublishPreviewV3Refusal,
} from '../outreach/publish-preview-v2.js';
import type { Router } from '../router.js';
import {
  jsonBodyNotRead,
  MAX_FINALIZED_REPORT_BODY_BYTES,
  readJsonBodyOrRespond,
  sendError,
  sendJson,
} from '../http-utils.js';
import { lookupOperatorProfile } from '../sirene/sirene-cache.js';
import { pdfDigestOf } from '../pipeline/pdf-digest.js';
import {
  releaseReportProduction,
  tryAcquireReportProduction,
} from '../pipeline/report-production-lock.js';
import { findingsAreStale, makeReportReady } from '../pipeline/make-report-ready.js';
import { readAuditArtifacts, runReportQualityForAudit } from '../pipeline/regenerate-reports.js';
import { resolveRenderInputs } from '../pipeline/build-render-bundle.js';
import { approveAndPromoteReportQualityBundle } from '../pipeline/report-quality-promotion.js';
import { readVerifiedImmutablePdf } from '../pipeline/report-quality-storage.js';
import {
  reportProductionState,
  type ReportProductionState,
} from '../pipeline/report-production-state.js';
import type { EvidenceFacts, ReportQualityFacts } from '../operator/audit-readiness.js';
import { buildAuditSnapshot } from '../operator/audit-snapshot.js';
import { projectLegacyJob } from '../operator/legacy-job-projection.js';
import { parseFinalizedReportUpload } from './finalized-report-upload.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { syncArtifactFilesToBucket } from '../artifacts/sync-audit-artifacts.js';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import {
  readAuditEvidenceDiagnostics,
  type AuditEvidenceDiagnostics,
} from '../pipeline/audit-evidence-diagnostics.js';

function isReportLanguage(value: string): value is ReportLanguage {
  return value === 'fr' || value === 'en';
}

export function parseReportThemeQuery(query: URLSearchParams): ReportTheme | undefined {
  for (const key of query.keys()) {
    if (key !== 'theme') return undefined;
  }
  const values = query.getAll('theme');
  if (values.length === 0) return 'dark';
  return values.length === 1 && (values[0] === 'dark' || values[0] === 'light')
    ? values[0]
    : undefined;
}

type CurrentReportPair = { fr: ReportDocument; en?: ReportDocument };

function approvalRefForReport(report: ReportDocument): {
  reportId: string;
  pdfDigest: string;
  variantDigests?: { light: string };
} {
  if (!report.reportId || !report.pdfDigest) {
    throw new Error('cannot approve a report without a report ID and digest');
  }
  return {
    reportId: report.reportId,
    pdfDigest: report.pdfDigest,
    ...(report.variants?.light === undefined
      ? {}
      : { variantDigests: { light: report.variants.light.pdfDigest } }),
  };
}

function provenanceMatches(
  actual: FindingsProvenance | undefined,
  expected: FindingsProvenance | undefined,
): boolean {
  return (
    actual?.findingsSchemaVersion === expected?.findingsSchemaVersion &&
    actual?.normalizationFingerprint === expected?.normalizationFingerprint &&
    actual?.findingsDigest === expected?.findingsDigest
  );
}

type OptionalFindingsProvenance = AuditManifest['findingsProvenance'];

async function readVerifiedReport(
  auditDir: string,
  report: ReportDocument,
  hostname: string,
  startedAt: Date,
  store: ArtifactStore | undefined,
  theme: ReportTheme = 'dark',
): Promise<Buffer | undefined> {
  const variant = resolveReportVariant(report, theme);
  if (variant.kind === 'unavailable') return undefined;
  let pdf: Buffer;
  try {
    pdf = await resolveArtifactFile(
      path.join(auditDir, variant.fileRef),
      buildArtifactBucketKey(hostname, startedAt, variant.fileRef),
      store,
    );
  } catch {
    return undefined;
  }
  const digest = pdfDigestOf(pdf);
  return digest === variant.pdfDigest ? pdf : undefined;
}

/** Pure over already-fetched reports and resolution, so a caller that has
 *  already paid for those reads (the dashboard's GET handler, which needs
 *  them for other fields anyway) does not pay for them twice. preReadPdfs
 *  carries those already-paid reads, produced by readVerifiedReport itself:
 *  a buffer exists exactly when the fresh read would have returned bytes,
 *  so supplying one cannot change the verdict. When it is absent (the
 *  approve-reports path via getFreshVerifiedPair, whose transaction must
 *  re-verify live) the pair is read fresh here, as before. */
async function verifyFreshPair(
  fr: ReportDocument | null,
  en: ReportDocument | null,
  resolution: SelectedAuditAnalysisPairResolution,
  auditDir: string,
  currentFindings: OptionalFindingsProvenance,
  hostname: string,
  startedAt: Date,
  store: ArtifactStore | undefined,
  preReadPdfs?: { fr: Buffer | undefined; en: Buffer | undefined },
): Promise<{ reports: CurrentReportPair; pdfs: { fr: Buffer; en?: Buffer } } | undefined> {
  // Plan 067: French is the canonical required report. English participates
  // only when the selected writing version explicitly carries an English
  // analysis; an older unrelated English report must never make French
  // readiness fail or be silently attached to it.
  if (resolution.kind === 'none') return undefined;
  const frAnalysis = resolution.fr;
  const enAnalysis = resolution.en;
  if (
    !fr ||
    !fr.reportId ||
    fr.analysisId !== frAnalysis.analysisId ||
    !provenanceMatches(frAnalysis.findingsProvenance, currentFindings) ||
    classifyReportFreshness(fr, currentFindings) !== 'fresh'
  ) {
    return undefined;
  }

  if (
    enAnalysis !== undefined &&
    (!en ||
      !en.reportId ||
      en.analysisId !== enAnalysis.analysisId ||
      !provenanceMatches(enAnalysis.findingsProvenance, currentFindings) ||
      classifyReportFreshness(en, currentFindings) !== 'fresh')
  ) {
    return undefined;
  }

  const frPdf =
    preReadPdfs?.fr ?? (await readVerifiedReport(auditDir, fr, hostname, startedAt, store));
  if (!frPdf) return undefined;

  if (enAnalysis === undefined) {
    return { reports: { fr }, pdfs: { fr: frPdf } };
  }

  const enPdf =
    preReadPdfs?.en ??
    (en ? await readVerifiedReport(auditDir, en, hostname, startedAt, store) : undefined);
  if (!en || !enPdf) return undefined;
  return { reports: { fr, en }, pdfs: { fr: frPdf, en: enPdf } };
}

/** Live-fetching wrapper for callers that need a fresh read on every call
 *  (the approve-reports transaction re-verifies the pair has not changed
 *  since it was first checked, so it cannot reuse an earlier fetch). The
 *  dashboard's GET handler calls verifyFreshPair directly instead, over
 *  reads it already made for other fields in the same response. */
async function getFreshVerifiedPair(
  connection: Connection,
  auditId: string,
  auditDir: string,
  currentFindings: OptionalFindingsProvenance,
  hostname: string,
  startedAt: Date,
  store: ArtifactStore | undefined,
): Promise<{ reports: CurrentReportPair; pdfs: { fr: Buffer; en?: Buffer } } | undefined> {
  const [fr, en, resolution] = await Promise.all([
    getLatestReport(connection, auditId, 'fr'),
    getLatestReport(connection, auditId, 'en'),
    resolveSelectedAnalysisPairForAudit(connection, auditId),
  ]);
  return verifyFreshPair(fr, en, resolution, auditDir, currentFindings, hostname, startedAt, store);
}

/** Issue #93: the reviewed remediation and French title copy per detector
 *  rule (trade-off 71), keyed by rule id over the audit's findings. The
 *  report package's tables are the single source, so the dashboard reads
 *  the same copy the PDF renders; a rule with no reviewed copy is simply
 *  absent and the page falls back to the finding's raw title. */
function buildRuleCopy(findings: readonly Finding[]): Record<string, ReviewedRuleCopy> {
  const copy: Record<string, ReviewedRuleCopy> = {};
  for (const finding of findings) {
    if (copy[finding.ruleId] !== undefined) continue;
    const translation = RULE_TRANSLATIONS_FR[finding.ruleId];
    const remediationFr = remediationFor(finding.ruleId, 'fr');
    const remediationEn = remediationFor(finding.ruleId, 'en');
    copy[finding.ruleId] = {
      ...(translation !== undefined ? { titleFr: translation.label } : {}),
      ...(translation !== undefined && translation.gloss !== ''
        ? { glossFr: translation.gloss }
        : {}),
      ...(remediationFr !== undefined ? { remediationFr } : {}),
      ...(remediationEn !== undefined ? { remediationEn } : {}),
    };
  }
  return copy;
}

interface ReviewedRuleCopy {
  titleFr?: string;
  glossFr?: string;
  remediationFr?: string;
  remediationEn?: string;
}

const MANUAL_TEXT_FIELDS = [
  'sirenSourceUrl',
  'raisonSociale',
  'nomCommercial',
  'declarationContactEmail',
] as const;

function isStatSector(value: unknown): value is StatSector {
  return value === 'general' || value === 'hospitality';
}

/** Body values are plain strings (the client never supplies provenance
 *  or updatedAt - both are always server-set, per the milestone's design
 *  constraints). Only keys actually present in the body are touched,
 *  matching setAuditManualFields' own merge semantics. Throws on a
 *  malformed sector value; every other field is a free-text string with
 *  no further shape to validate here (siren is validated separately,
 *  below, since it also needs the Sirene confirmation flow). */
function parseManualFieldsBody(raw: unknown): Omit<AuditManualFields, 'updatedAt'> {
  const result: Omit<AuditManualFields, 'updatedAt'> = {};
  if (raw === null || typeof raw !== 'object') return result;
  const record = raw as Record<string, unknown>;

  for (const key of MANUAL_TEXT_FIELDS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      result[key] = { value: value.trim(), provenance: 'operator' };
    }
  }

  if (record['sector'] !== undefined) {
    if (!isStatSector(record['sector'])) {
      throw new Error('sector must be "general" or "hospitality"');
    }
    result.sector = { value: record['sector'], provenance: 'operator' };
  }

  if (record['transactionalFlowOverride'] !== undefined) {
    const override = record['transactionalFlowOverride'];
    if (override === null || typeof override !== 'object') {
      throw new Error('transactionalFlowOverride must be an object');
    }
    const overrideRecord = override as Record<string, unknown>;
    if (typeof overrideRecord['value'] !== 'boolean') {
      throw new Error('transactionalFlowOverride.value must be a boolean');
    }
    if (typeof overrideRecord['reason'] !== 'string' || overrideRecord['reason'].trim() === '') {
      throw new Error('transactionalFlowOverride.reason must be a non-empty string');
    }
    result.transactionalFlowOverride = {
      value: overrideRecord['value'],
      reason: overrideRecord['reason'].trim(),
    };
  }

  return result;
}

/** Issue #90: the job row whose pipeline run produced this audit, when that
 *  run stopped at 'failed' or 'needs-input' after the audit itself was
 *  persisted. The auditId is written onto the job as soon as the audit
 *  stage resolves (the #35 fix), so the job is resolvable from the audit;
 *  a re-run of the same site creates its own audit, so the match is exact.
 *  The job's stored error is the only place the report-stage failure
 *  reason exists, and the needs-input case additionally carries the typed
 *  fields the operator must confirm. */
async function getFailedJobForAudit(
  connection: Connection,
  auditId: string,
): Promise<JobDocument | null> {
  return createJobModel(connection)
    .findOne({ auditId, status: { $in: ['failed', 'needs-input'] } })
    .sort({ createdAt: -1 })
    .lean<JobDocument | null>();
}

/** Plan 060 §5.2: the audit's latest Plan-058 quality run, for the operator
 *  snapshot's readiness axes. Bounded read: the projection needs only the
 *  run's state and id, never its provenance arrays. */
async function getLatestReportQualityRun(
  connection: Connection,
  auditId: string,
): Promise<ReportQualityRunDocument | null> {
  return createReportQualityRunModel(connection)
    .findOne({ auditId })
    .sort({ createdAt: -1 })
    .lean<ReportQualityRunDocument | null>();
}

/** The report-quality review endpoint is an operator surface, not a storage
 *  dump. In particular, private candidate object keys must never cross the
 *  dashboard boundary; the PDF link below resolves them server-side only
 *  after the operator has the exact bundle digest. */
function reportQualityBundleForDashboard(
  bundle: ReportBundleDocument | ActiveReportBundleDocument | null,
): Record<string, unknown> | null {
  if (bundle === null) return null;
  return {
    bundleId: bundle.bundleId,
    qualityRunId: bundle.qualityRunId,
    auditId: bundle.auditId,
    epoch: bundle.epoch,
    bundleDigest: bundle.bundleDigest,
    state: 'state' in bundle ? bundle.state : 'active',
    ...('createdAt' in bundle ? { createdAt: bundle.createdAt } : {}),
    ...('activatedAt' in bundle ? { activatedAt: bundle.activatedAt } : {}),
    fr: {
      pdfDigest: bundle.fr.pdfDigest,
      ...('pageCount' in bundle.fr ? { pageCount: bundle.fr.pageCount } : {}),
    },
    en: {
      pdfDigest: bundle.en.pdfDigest,
      ...('pageCount' in bundle.en ? { pageCount: bundle.en.pageCount } : {}),
    },
  };
}

/** Plan 068 evidence availability for the operator snapshot. The normal
 * product reads the scoped diagnostic projection, never approval state.
 * Graph existence is used only to distinguish a historical pre-diagnostics
 * full audit from a current audit whose detailed diagnostics are unavailable. */
function evidenceFactsForAudit(
  audit: Pick<AuditDocumentFields, 'scanIntent'>,
  diagnostics: AuditEvidenceDiagnostics | undefined,
  graphAssessed: boolean,
): EvidenceFacts {
  const legacyAudit =
    diagnostics?.status === 'unavailable' &&
    !graphAssessed &&
    audit.scanIntent !== 'quick-check' &&
    audit.scanIntent !== 'prospecting-audit';
  return {
    ...(diagnostics !== undefined ? { diagnosticsStatus: diagnostics.status } : {}),
    ...(diagnostics?.clientLimitations.length
      ? { limitationCodes: diagnostics.clientLimitations.map((limitation) => limitation.code) }
      : {}),
    ...(legacyAudit ? { legacyAudit: true } : {}),
  };
}

/** Report facts for the operator snapshot, from the Plan-058 authority's
 *  durable rows plus the in-memory production registry. A rerun starts a new
 *  run document, so a latest bundle whose run is not the latest run came
 *  from an earlier iteration; the bundle row only reaches
 *  operator-approved/promoted through the exact-digest approval path. */
function reportFactsForAudit(input: {
  run: ReportQualityRunDocument | null;
  latestBundle: ReportBundleDocument | null;
  activeBundle: ActiveReportBundleDocument | null;
  production: ReportProductionState;
}): ReportQualityFacts {
  const { run, latestBundle, activeBundle, production } = input;
  return {
    ...(run !== null ? { runState: run.state, runRef: run.qualityRunId } : {}),
    ...(latestBundle !== null ? { candidateDigest: latestBundle.bundleDigest } : {}),
    ...(activeBundle !== null ? { activeDigest: activeBundle.bundleDigest } : {}),
    ...(latestBundle !== null && run !== null && run.qualityRunId !== latestBundle.qualityRunId
      ? { candidateSuperseded: true }
      : {}),
    operatorApprovalMatchesCurrentBundle:
      latestBundle !== null &&
      (latestBundle.state === 'operator-approved' || latestBundle.state === 'promoted'),
    producing: production.status === 'writing' || production.status === 'pdf-generation',
  };
}

/** Plan 037 slice 5: the outreach preview section of the audit detail page.
 *  One build path for both the on-page render and the operator PDF: a
 *  prospect-linked audit goes through the exact summary build publication
 *  uses, so what the operator inspects here is what a published link would
 *  serve; any other audit gets an internal view built
 *  straight from the stored audit and findings (French, no recipient
 *  facts). Refusal names are the stable API strings the store and the v2
 *  publish path already use; they are never translated. */
type OutreachPreviewBuildOutcome =
  { state: 'rendered'; html: string } | { state: 'refused'; refusal: PublishPreviewV3Refusal };

async function buildAuditOutreachPreviewHtml(
  connection: Connection,
  audit: AuditDocumentFields,
  artifactStore: ArtifactStore | undefined,
): Promise<OutreachPreviewBuildOutcome> {
  const publicBaseUrl = getPreviewPublicBaseUrl();
  const prospectId = audit.prospectId;

  if (prospectId !== undefined) {
    const store = createMongoOutreachPreviewStoreV3(connection, { prospectId });
    const row = await store.findPublicationRow(prospectId);
    if ('refused' in row) return { state: 'refused', refusal: row.refused };
    const built = buildOutreachPreviewSummaryV3({ row, language: 'fr', publicBaseUrl });
    if ('refused' in built) return { state: 'refused', refusal: built.refused };
    return { state: 'rendered', html: generateOutreachPreviewHtmlV3(built.summary) };
  }

  const [findings, selected, frReport] = await Promise.all([
    getFindingsForAudit(connection, audit.auditId),
    resolveSelectedAnalysisPairForAudit(connection, audit.auditId),
    getLatestReport(connection, audit.auditId, 'fr'),
  ]);
  if (
    selected.kind === 'none' ||
    frReport === null ||
    frReport.analysisId !== selected.fr.analysisId ||
    !provenanceMatches(selected.fr.findingsProvenance, audit.findingsProvenance) ||
    !provenanceMatches(frReport.findingsProvenance, audit.findingsProvenance) ||
    audit.findingsProvenance?.findingsDigest === undefined
  ) {
    return { state: 'refused', refusal: 'report-not-ready' };
  }
  const hostname = new URL(audit.siteUrl).hostname;
  const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
  const diagnostics = await readAuditEvidenceDiagnostics({
    auditDir,
    hostname,
    startedAt: audit.startedAt,
    store: artifactStore,
  });
  const built = buildOutreachPreviewSummaryV3({
    row: {
      prospectId: '',
      domain: hostname,
      businessName: audit.manualFields?.nomCommercial?.value ?? hostname,
      dataOrigins: [
        'public-website',
        ...(selected.fr.obligationAssessment?.registrySnapshot !== undefined
          ? (['public-business-registry'] as const)
          : []),
      ],
      audit,
      findings,
      analysis: selected.fr,
      diagnostics,
    },
    language: 'fr',
    publicBaseUrl,
  });
  if ('refused' in built) return { state: 'refused', refusal: built.refused };
  return { state: 'rendered', html: generateOutreachPreviewHtmlV3(built.summary) };
}

export function registerAuditRoutes(router: Router, connection: Connection): void {
  // Issue #63: built once, since a caller with no bucket configured must
  // never pay a per-request cost for constructing one, and every read
  // below shares the same fallback behaviour.
  const artifactStore = createConfiguredArtifactStore();

  router.get('/api/audits/:auditId', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    const [
      findings,
      severityRollup,
      reportLanguages,
      selectedPair,
      approval,
      frReport,
      enReport,
      failureJob,
      latestQualityBundle,
      activeQualityBundle,
      latestQualityRun,
    ] = await Promise.all([
      getFindingsForAudit(connection, auditId),
      getSeverityRollup(connection, auditId),
      listReportLanguages(connection, auditId),
      resolveSelectedAnalysisPairForAudit(connection, auditId),
      getLatestReportApproval(connection, auditId),
      getLatestReport(connection, auditId, 'fr'),
      getLatestReport(connection, auditId, 'en'),
      getFailedJobForAudit(connection, auditId),
      getLatestReportBundle(connection, auditId),
      getActiveReportBundle(connection, auditId),
      getLatestReportQualityRun(connection, auditId),
    ]);
    // A failed regeneration advances the selected writing pair before PDF
    // rendering. Keep older report documents as history, but never advertise
    // them as the current pair: approval and download deliberately validate
    // against the selection and would otherwise reject the dashboard's own
    // apparently-ready action (issue #214).
    const currentFrReport =
      selectedPair.kind !== 'none' && frReport?.analysisId === selectedPair.fr.analysisId
        ? frReport
        : null;
    const currentEnReport =
      selectedPair.kind !== 'none' &&
      selectedPair.en !== undefined &&
      enReport?.analysisId === selectedPair.en.analysisId
        ? enReport
        : null;
    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    // Plan 068: graph existence distinguishes a pre-diagnostics historical
    // audit from a current diagnostics file that is unreadable. No approval
    // artifact participates in normal product readiness.
    const graphAssessed = hasAssessedEvidenceGraph(auditDir);
    // Issue #91: resolve each language's PDF availability up front, so the
    // dashboard can render report rows that tell "the report is fine but
    // elsewhere" apart from "the report is gone" instead of asserting a
    // freshness the endpoints cannot honour. These are the same
    // digest-verified reads verifyFreshPair consumes below, so each
    // language's PDF is read at most once per request (issue #139) and the
    // buffers are shared; a bucket hit is cached locally by
    // resolveArtifactFile, so one dashboard visit repairs availability for
    // the next.
    const [frPdf, enPdf, frLightPdf, enLightPdf] = await Promise.all([
      currentFrReport === null
        ? Promise.resolve(undefined)
        : readVerifiedReport(auditDir, currentFrReport, hostname, audit.startedAt, artifactStore),
      currentEnReport === null
        ? Promise.resolve(undefined)
        : readVerifiedReport(auditDir, currentEnReport, hostname, audit.startedAt, artifactStore),
      activeQualityBundle !== null || currentFrReport === null
        ? Promise.resolve(undefined)
        : readVerifiedReport(
            auditDir,
            currentFrReport,
            hostname,
            audit.startedAt,
            artifactStore,
            'light',
          ),
      activeQualityBundle !== null || currentEnReport === null
        ? Promise.resolve(undefined)
        : readVerifiedReport(
            auditDir,
            currentEnReport,
            hostname,
            audit.startedAt,
            artifactStore,
            'light',
          ),
    ]);
    const frPdfAvailable = frPdf !== undefined;
    const enPdfAvailable = enPdf !== undefined;
    const frLightPdfAvailable = frLightPdf !== undefined;
    const enLightPdfAvailable = enLightPdf !== undefined;
    // Plan 072: whether a finalization exists per language, which is a
    // separate question from which report is current - a regeneration can
    // have overtaken one, and that is what the dashboard has to say out loud.
    const [frFinalized, enFinalized] = await Promise.all([
      getLatestFinalizedReport(connection, auditId, 'fr'),
      getLatestFinalizedReport(connection, auditId, 'en'),
    ]);
    const reports = (['fr', 'en'] as const).map((language) => {
      const report = language === 'fr' ? currentFrReport : currentEnReport;
      const finalized = language === 'fr' ? frFinalized : enFinalized;
      const current = report !== null && reportOrigin(report) === 'finalized';
      return {
        language,
        status: (report
          ? classifyReportFreshness(report, audit.findingsProvenance)
          : 'unverified') as ReportFreshness,
        // Optional measured page count (plan 018), omitted entirely for
        // a legacy document without one: the dashboard's length warning
        // must never be derived from an inferred value.
        ...(report?.pageCount !== undefined ? { pageCount: report.pageCount } : {}),
        ...(report !== null && !reportUsesCurrentTemplate(report) ? { olderTemplate: true } : {}),
        ...(current && report?.finalization !== undefined
          ? {
              finalized: {
                overrideCount: report.finalization.overrideCount,
                finalizedAt: report.finalization.uploadedAt.toISOString(),
              },
            }
          : {}),
        ...(!current && finalized !== null ? { finalizationSuperseded: true } : {}),
        pdfAvailable: language === 'fr' ? frPdfAvailable : enPdfAvailable,
        lightAvailable: language === 'fr' ? frLightPdfAvailable : enLightPdfAvailable,
      };
    });
    const verifiedPair = await verifyFreshPair(
      frReport,
      enReport,
      selectedPair,
      auditDir,
      audit.findingsProvenance,
      hostname,
      audit.startedAt,
      artifactStore,
      { fr: frPdf, en: enPdf },
    );
    const analysed = Boolean(
      selectedPair.kind !== 'none' &&
      provenanceMatches(selectedPair.fr.findingsProvenance, audit.findingsProvenance) &&
      (selectedPair.en === undefined ||
        provenanceMatches(selectedPair.en.findingsProvenance, audit.findingsProvenance)),
    ); // Plan 032 (issue #162): the selected pair was produced by the audit
    // fallback gate, so its reports carry no model-written analysis. The
    // operator sees why the report has no themes instead of reading the
    // absence as a failure. Absent pair reads as false: no analysis exists
    // to be a fallback one.
    const analysisIsStaticFallback =
      selectedPair.kind !== 'none' &&
      (selectedPair.fr.generationMode === 'static-fallback' ||
        selectedPair.en?.generationMode === 'static-fallback');
    const approved = Boolean(
      verifiedPair && approvalMatchesReportPair(approval, verifiedPair.reports),
    );
    const lifecycle = approved
      ? 'approved'
      : verifiedPair
        ? 'rendered'
        : analysed
          ? 'analysed'
          : 'scanned';
    // Plan 068: full audits expose scoped diagnostics even when the detailed
    // diagnostic artifact is unavailable. Quick/prospecting scans do not
    // promise this layer and therefore keep the field absent.
    const evidence =
      audit.scanIntent === 'quick-check' || audit.scanIntent === 'prospecting-audit'
        ? undefined
        : await readAuditEvidenceDiagnostics({
            auditDir,
            hostname,
            startedAt: audit.startedAt,
            store: artifactStore,
          });
    // Plan 047: prospect provenance and current preview state come from the
    // durable prospect identity; no legacy candidate link is consulted.
    const outreachProspectId = audit.prospectId ?? null;
    const prospect =
      outreachProspectId === null ? null : await getProspectHub(connection, outreachProspectId);
    const hasLivePreview =
      outreachProspectId !== null &&
      (
        await listOutreachPreviews(connection, {
          prospectId: outreachProspectId,
          status: 'live',
          limit: 10,
        })
      ).some(
        (preview) =>
          preview.sourceKind === 'full-audit' &&
          (preview.previewContentVersion === 'v2' || preview.previewContentVersion === 'v3') &&
          preview.publicExpiresAt.getTime() > Date.now(),
      );

    // Issue: operator-reviewed overall grade override. computeAutomaticGrade
    // needs the full AuditManifest shape (findings + manifest.pages); the
    // cast is safe because it only reads pages/coverage fields, never the
    // three Date-vs-ISO-string fields that separate AuditDocument from
    // AuditManifest (see audit.schema.ts's own doc comment).
    const automaticGrade = computeAutomaticGrade(findings, audit as unknown as AuditManifest);
    const effectiveGrade = resolveEffectiveGrade(automaticGrade, audit.gradeOverride);
    // Issue #392: findings wholly inside third-party markup (an embedded
    // player, a vendor widget) are labelled as such, and the header says
    // how many of each severity they account for.
    const thirdParty = summarizeThirdPartyFindings(findings);

    // Plan 060 §5.2/§5.3: the server-produced operator snapshot. The server
    // is the semantic boundary: readiness is projected here from the owning
    // authorities' rows, and the browser only translates codes. Work,
    // capabilities and attention projections beyond the failure job below
    // arrive with later slices, so they stay honestly empty.
    const snapshot = buildAuditSnapshot({
      subject: {
        ...(audit.prospectId !== undefined ? { prospectId: audit.prospectId } : {}),
        auditId: audit.auditId,
        ...(prospect !== null ? { siteLabel: prospect.name } : {}),
      },
      work: failureJob !== null ? [projectLegacyJob(failureJob)] : [],
      evidenceFacts: evidenceFactsForAudit(audit, evidence, graphAssessed),
      reportFacts: reportFactsForAudit({
        run: latestQualityRun,
        latestBundle: latestQualityBundle,
        activeBundle: activeQualityBundle,
        production: reportProductionState(auditId),
      }),
      capabilities: {},
      attention: [],
    });

    sendJson(res, 200, {
      auditId: audit.auditId,
      prospectId: audit.prospectId,
      scanIntent: audit.scanIntent ?? null,
      siteUrl: audit.siteUrl,
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      pagesVisited: audit.crawl.visitedCount,
      pushbackEvents: audit.pushbackEvents,
      pacingRecoveryEvents: audit.pacingRecoveryEvents,
      crawlDelayMs: audit.crawl.effectiveDelayMs,
      coverageSummary: summarizeAuditCoverage(audit),
      severityRollup,
      thirdPartySeverityRollup: thirdParty.severityRollup,
      findings,
      thirdPartyFindings: thirdParty.byFindingId,
      // Issue #93: reviewed FR/EN copy per rule id referenced by the
      // findings above.
      ruleCopy: buildRuleCopy(findings),
      reportLanguages,
      reports,
      lifecycle,
      // Plan 045 slice 1.2: reachability facts the produce step needs that
      // it previously had to infer from an approved candidate or existing
      // report rows, neither of which an audit like Belleval (confirmed
      // fields, both analyses, zero reports) had. findingsStale reuses the
      // exact schema-version/fingerprint comparison makeReportReady acts
      // on, against findings already fetched above (no extra I/O).
      analysisPair: selectedPair.kind,
      analysisLanguages:
        selectedPair.kind === 'none' ? [] : selectedPair.en === undefined ? ['fr'] : ['fr', 'en'],
      findingsStale: findingsAreStale(audit.findingsProvenance, findings),
      analysisIsStaticFallback,
      approval: approved ? approval : null,
      manualFields: audit.manualFields,
      automaticGrade,
      effectiveGrade,
      gradeOverride: audit.gradeOverride ?? null,
      ...(evidence !== undefined ? { evidence } : {}),
      outreach: { prospectId: outreachProspectId, hasLivePreview },
      prospect: prospect === null ? null : { prospectId: prospect.prospectId, name: prospect.name },
      // Plan 060 §5.2: additive operator snapshot; the dashboard schema is
      // passthrough, so existing fields are untouched.
      snapshot,
      canAttachProspect: true,
      // Issue #90: the failed job's own record, so the audit pages can show
      // the reason and its prescribed fix instead of a bare failed badge.
      ...(failureJob !== null
        ? {
            failure: {
              jobId: failureJob.jobId,
              status: failureJob.status,
              error: failureJob.error ?? '',
              ...(failureJob.needsInputFields !== undefined
                ? { needsInputFields: failureJob.needsInputFields }
                : {}),
            },
          }
        : {}),
      ...(audit.siteSignals?.hasTransactionalFlow !== undefined
        ? { detectedTransactionalFlow: audit.siteSignals.hasTransactionalFlow }
        : {}),
    });
  });

  router.post('/api/audits/:auditId/manual-fields/siren-preview', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAuditRuntimeFields(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    const rawSiren =
      body !== null && typeof body === 'object'
        ? (body as Record<string, unknown>)['siren']
        : undefined;
    if (typeof rawSiren !== 'string') {
      sendError(res, 400, 'siren must be a string');
      return;
    }
    const cleaned = rawSiren.replace(/\s/g, '');
    if (!isValidSiren(cleaned)) {
      sendError(res, 400, 'siren must be a valid SIREN (9 digits, passing the INSEE checksum)');
      return;
    }

    // Rule 3: resolve and echo back the entity for the operator to
    // confirm before this SIREN is ever persisted - a typo that
    // happens to pass the checksum but resolves to a different company
    // is a bad failure on a legal-adjacent page.
    const lookup = await lookupOperatorProfile(connection, cleaned);
    if (lookup.status !== 'found') {
      sendJson(res, 200, { siren: cleaned, resolved: false, lookupStatus: lookup.status });
      return;
    }
    sendJson(res, 200, {
      siren: cleaned,
      resolved: true,
      denomination: lookup.profile.denomination.value,
    });
  });

  router.patch('/api/audits/:auditId/manual-fields', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAuditRuntimeFields(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    if (body === null || typeof body !== 'object') {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    const record = body as Record<string, unknown>;

    let partial: Omit<AuditManualFields, 'updatedAt'>;
    try {
      partial = parseManualFieldsBody(record);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid manual fields');
      return;
    }

    const rawSiren = record['siren'];
    if (typeof rawSiren === 'string' && rawSiren.trim() !== '') {
      const cleaned = rawSiren.replace(/\s/g, '');
      if (!isValidSiren(cleaned)) {
        sendError(res, 400, 'siren must be a valid SIREN (9 digits, passing the INSEE checksum)');
        return;
      }
      // Confirmed via the preview route above before this call is ever
      // made by the dashboard UI; re-resolved here too so a direct API
      // call gets the same guarantee, not just the UI's own flow.
      const lookup = await lookupOperatorProfile(connection, cleaned);
      if (lookup.status !== 'found') {
        sendError(
          res,
          400,
          `siren ${cleaned} could not be confirmed against the Sirene registry (${lookup.status})`,
        );
        return;
      }
      partial.siren = { value: cleaned, provenance: 'operator' };
    }

    if (Object.keys(partial).length === 0) {
      sendError(res, 400, 'no recognized manual fields in request body');
      return;
    }

    try {
      // Plan 057: a linked audit's trading name, legal name and SIREN belong
      // to its prospect, so those edits are saved there and synced back.
      const identity: AuditIdentityValues = {};
      if (audit.prospectId !== undefined) {
        for (const field of ['nomCommercial', 'raisonSociale', 'siren'] as const) {
          const entry = partial[field];
          if (entry === undefined) continue;
          identity[field] = entry.value;
          delete partial[field];
        }
      }
      if (audit.prospectId !== undefined && Object.keys(identity).length > 0) {
        await saveLinkedAuditIdentity(connection, auditId, audit.prospectId, identity);
      }
      if (Object.keys(partial).length > 0) {
        await setAuditManualFields(connection, auditId, partial);
      }
      sendJson(res, 200, { manualFields: await getAuditManualFields(connection, auditId) });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'could not save manual fields');
    }
  });

  // Issue: operator-reviewed overall grade override. Same validation shape
  // as the manual-fields PATCH above: look up the audit, 404 if missing,
  // then reject a malformed body with 400 before ever calling the store.
  router.put('/api/audits/:auditId/grade-override', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAuditRuntimeFields(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    if (body === null || typeof body !== 'object') {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    const record = body as Record<string, unknown>;

    const grade = record['grade'];
    if (typeof grade !== 'string' || !isGrade(grade)) {
      sendError(res, 400, 'grade must be one of A, B, C, D');
      return;
    }
    const reason = record['reason'];
    if (typeof reason !== 'string' || reason.trim() === '') {
      sendError(res, 400, 'reason must be a non-empty string');
      return;
    }
    if (reason.length > 2000) {
      sendError(res, 400, 'reason must be 2000 characters or fewer');
      return;
    }

    try {
      const gradeOverride = await setAuditGradeOverride(connection, auditId, {
        grade,
        reason: reason.trim(),
      });
      sendJson(res, 200, { gradeOverride });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'could not save grade override');
    }
  });

  router.delete('/api/audits/:auditId/grade-override', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAuditRuntimeFields(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    try {
      await clearAuditGradeOverride(connection, auditId);
      sendJson(res, 200, { cleared: true });
    } catch (error) {
      sendError(
        res,
        400,
        error instanceof Error ? error.message : 'could not clear grade override',
      );
    }
  });

  // Plan 045 slice 1.3: the inline Confirm button next to a detected
  // identity field (the stepper's first step, and NeedsInputCard on the
  // progress page) stamps that one field as operator-confirmed, then, once
  // no detected identity field remains, tries to get the reports the rest
  // of the way to disk itself - the operator's whole reason for confirming
  // was to unblock the PDF, not to separately go find a produce button.
  // Never invents a patch for a field with no detected value: the confirm
  // button never renders for one, and a mismatched field name is a 400,
  // not a silent no-op.
  router.post('/api/audits/:auditId/manual-fields/confirm', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAuditRuntimeFields(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    if (body === null || typeof body !== 'object') {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    const record = body as Record<string, unknown>;
    const field = record['field'];
    const value = record['value'];
    if (field !== 'nomCommercial' && field !== 'raisonSociale') {
      sendError(res, 400, 'field must be "nomCommercial" or "raisonSociale"');
      return;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      sendError(res, 400, 'value must be a non-empty string');
      return;
    }

    // Plan 057: on a linked audit the confirmed name is saved on the prospect.
    const manualFields =
      audit.prospectId === undefined
        ? await setAuditManualFields(connection, auditId, {
            [field]: { value: value.trim(), provenance: 'operator' },
          })
        : await saveLinkedAuditIdentity(connection, auditId, audit.prospectId, {
            [field]: value.trim(),
          });

    if (findUnconfirmedIdentityFields(manualFields).length > 0) {
      // The other identity field is still a detected, unconfirmed guess:
      // no point attempting makeReportReady, which would only refuse with
      // the same identity-unconfirmed refusal this route already knows about.
      sendJson(res, 200, { manualFields, pdfs: 'waiting-other-field' });
      return;
    }

    try {
      const outcome = await makeReportReady(connection, auditId, artifactStore);
      sendJson(res, 200, {
        manualFields,
        pdfs: outcome.kind === 'ready' ? 'generated' : outcome.refusal,
      });
    } catch (error) {
      sendError(res, 409, error instanceof Error ? error.message : 'could not regenerate reports');
    }
  });

  // Manual-input-layer milestone: re-renders the selected French report
  // and, when explicitly attached, its English version, exactly what
  // `odysseus report <dir> --all` does. Plan 045 slice 1.1: routed through
  // makeReportReady, which refreshes stale findings and the writing pair
  // first when needed, instead of only ever rendering whatever pair is
  // already selected - the saved manualFields (siren included) are still
  // picked up automatically by runReportStage's own fresh-recompute step.
  router.post('/api/audits/:auditId/regenerate-report', async ({ res, params }) => {
    const auditId = params['auditId']!;
    try {
      const outcome = await makeReportReady(connection, auditId, artifactStore);
      if (outcome.kind === 'refused') {
        switch (outcome.refusal.kind) {
          case 'audit-not-found':
            sendError(res, 404, 'audit not found');
            return;
          case 'scan-data-missing':
            sendError(res, 404, 'audit artifacts not found on disk or in the bucket');
            return;
          case 'no-analysis':
            sendError(
              res,
              409,
              'a selected French analysis is required before a report can be regenerated; ' +
                'run the writing regeneration in the Prepare report card, then approve the candidate',
            );
            return;
          case 'identity-unconfirmed':
            sendError(
              res,
              409,
              'the detected commercial name and/or legal name must be confirmed before a report ' +
                'can be regenerated: ' +
                outcome.refusal.fields.map((field) => field.field).join(', '),
            );
            return;
        }
      }
      sendJson(res, 200, {
        reports: outcome.reports,
        findingsWereRefreshed: outcome.findingsWereRefreshed,
      });
    } catch (error) {
      sendError(res, 409, error instanceof Error ? error.message : 'could not regenerate reports');
    }
  });

  router.post('/api/audits/:auditId/report-quality', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAuditRuntimeFields(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    try {
      sendJson(res, 201, {
        reportQuality: await runReportQualityForAudit(connection, audit, artifactStore),
      });
    } catch (error) {
      sendError(
        res,
        error instanceof Error && error.name === 'ReportQualityLeaseConflictError' ? 409 : 422,
        error instanceof Error ? error.message : 'report quality run failed',
      );
    }
  });
  router.get('/api/audits/:auditId/report-quality', async ({ res, params }) => {
    const auditId = params['auditId']!;
    if (!(await getAuditRuntimeFields(connection, auditId))) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const [run, candidate, active] = await Promise.all([
      getLatestReportQualityRunSummary(connection, auditId),
      getLatestReportBundle(connection, auditId),
      getActiveReportBundle(connection, auditId),
    ]);
    sendJson(res, 200, {
      run,
      candidate: reportQualityBundleForDashboard(candidate),
      active: reportQualityBundleForDashboard(active),
    });
  });
  router.get(
    '/api/audits/:auditId/report-quality/:bundleDigest/:language',
    async ({ res, params }) => {
      const auditId = params['auditId']!,
        language = params['language']!,
        bundleDigest = params['bundleDigest']!;
      if (!isReportLanguage(language) || !/^sha256:[a-f0-9]{64}$/u.test(bundleDigest)) {
        sendError(res, 400, 'valid bundle digest and language are required');
        return;
      }
      if (!artifactStore) {
        sendError(res, 503, 'artifact store is not configured');
        return;
      }
      const bundle = await getReportBundleByDigest(
        connection,
        auditId,
        bundleDigest as `sha256:${string}`,
      );
      if (!bundle) {
        sendError(res, 404, 'report quality bundle not found');
        return;
      }
      try {
        const candidate = bundle[language];
        const pdf = await readVerifiedImmutablePdf(
          artifactStore,
          candidate.privateObjectKey,
          candidate.pdfDigest,
        );
        res.statusCode = 200;
        res.setHeader('content-type', 'application/pdf');
        res.setHeader('etag', `"${candidate.pdfDigest}"`);
        res.setHeader('cache-control', 'private, no-store');
        res.end(pdf);
      } catch (error) {
        sendError(res, 409, error instanceof Error ? error.message : 'candidate bytes unavailable');
      }
    },
  );
  router.post('/api/audits/:auditId/report-quality/approve', async ({ req, res, params }) => {
    const auditId = params['auditId']!,
      body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    if (body === null || typeof body !== 'object') {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    const record = body as Record<string, unknown>,
      qualityRunId = record['qualityRunId'],
      epoch = record['epoch'],
      bundleDigest = record['bundleDigest'];
    if (
      typeof qualityRunId !== 'string' ||
      typeof epoch !== 'number' ||
      !Number.isInteger(epoch) ||
      typeof bundleDigest !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/u.test(bundleDigest)
    ) {
      sendError(res, 400, 'qualityRunId, integer epoch, and exact bundleDigest are required');
      return;
    }
    try {
      sendJson(res, 201, {
        promoted: await approveAndPromoteReportQualityBundle(connection, artifactStore, {
          auditId,
          qualityRunId,
          epoch,
          bundleDigest: bundleDigest as `sha256:${string}`,
        }),
      });
    } catch (error) {
      sendError(res, 409, error instanceof Error ? error.message : 'bundle could not be promoted');
    }
  });

  router.post('/api/audits/:auditId/approve-reports', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAuditRuntimeFields(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    const pair = await getFreshVerifiedPair(
      connection,
      auditId,
      auditDir,
      audit.findingsProvenance,
      hostname,
      audit.startedAt,
      artifactStore,
    );
    if (!pair) {
      sendError(res, 409, 'a fresh, digest-verified French report is required before approval');
      return;
    }
    const approval = {
      approvalId: randomUUID(),
      auditId,
      fr: approvalRefForReport(pair.reports.fr),
      ...(pair.reports.en !== undefined ? { en: approvalRefForReport(pair.reports.en) } : {}),
      approvedAt: new Date(),
    };
    try {
      await connection.transaction(async (session) => {
        const current = await getFreshVerifiedPair(
          connection,
          auditId,
          auditDir,
          audit.findingsProvenance,
          hostname,
          audit.startedAt,
          artifactStore,
        );
        if (
          !current ||
          current.reports.fr.reportId !== pair.reports.fr.reportId ||
          current.reports.fr.pdfDigest !== pair.reports.fr.pdfDigest ||
          current.reports.fr.variants?.light?.pdfDigest !==
            pair.reports.fr.variants?.light?.pdfDigest ||
          current.reports.en?.reportId !== pair.reports.en?.reportId ||
          current.reports.en?.pdfDigest !== pair.reports.en?.pdfDigest ||
          current.reports.en?.variants?.light?.pdfDigest !==
            pair.reports.en?.variants?.light?.pdfDigest
        ) {
          throw new Error('selected report version changed during approval');
        }
        await persistReportApproval(connection, approval, session);
      });
    } catch (error) {
      sendError(
        res,
        409,
        error instanceof Error ? error.message : 'report pair could not be approved',
      );
      return;
    }
    sendJson(res, 201, { approval });
  });

  /** Plan 072: the exact inputs this server would render the selected report
   *  from, as transferable JSON, so the finalizer can re-render it locally
   *  with current code and no rescan. Read-only, and deliberately not the
   *  PDF: the point is to render again, not to fetch what was rendered
   *  before. Carries no page screenshots because the template reads none. */
  router.get('/api/audits/:auditId/render-bundle/:language', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const language = params['language']!;
    if (!isReportLanguage(language)) {
      sendError(res, 400, 'language must be "fr" or "en"');
      return;
    }
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    let manifest: AuditManifest;
    let findings: Finding[];
    try {
      ({ manifest, findings } = await readAuditArtifacts(
        auditDir,
        hostname,
        audit.startedAt,
        artifactStore,
      ));
    } catch {
      sendError(res, 404, 'audit artifacts not found on disk or in the bucket');
      return;
    }

    // The same selection the report stage renders: the selected exact pair,
    // never a ready-but-unapproved writing candidate.
    const resolution = await resolveSelectedAnalysisPairForAudit(connection, auditId);
    if (resolution.kind === 'none') {
      sendError(res, 409, 'a selected analysis is required before a render bundle exists');
      return;
    }
    const analysis = language === 'fr' ? resolution.fr : resolution.en;
    if (!analysis) {
      sendError(res, 409, `no selected ${language} analysis for this audit`);
      return;
    }

    const findingsProvenance = buildFindingsProvenance(findings);
    const renderInputs = await resolveRenderInputs({
      connection,
      auditDir,
      manifest,
      findings,
      analysis,
      findingsProvenance,
      artifactStore,
    });
    try {
      sendJson(
        res,
        200,
        buildRenderBundle({
          manifest,
          findings,
          analysis,
          findingsProvenance,
          renderInputs,
          rendererBuild: readOdysseusBuildId(),
        }),
      );
    } catch (error) {
      sendError(res, 409, error instanceof Error ? error.message : 'render bundle refused');
    }
  });

  /**
   * Plan 072: the operator's finalized PDF, rendered locally from the bundle
   * above and uploaded back as the delivered artifact.
   *
   * JSON with the PDF base64-encoded rather than multipart, because the
   * router requires an exact `application/json` content type on every
   * state-changing route as its CSRF guard and that guard stays intact.
   *
   * It inserts an ordinary `reports` row. The collection is insert-only by
   * design, `getLatestReport` sorts by generatedAt, so the finalized row
   * becomes what preview and download serve with no route change - and a
   * later regeneration inserts a newer pipeline row that takes over, which
   * is correct, because the corrections no longer apply to the text it
   * carries.
   */
  router.post('/api/audits/:auditId/report/:language/finalized', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const language = params['language']!;
    if (!isReportLanguage(language)) {
      sendError(res, 400, 'language must be "fr" or "en"');
      return;
    }
    if (!tryAcquireReportProduction(auditId, 'writing')) {
      sendError(res, 409, 'reports for this audit are already being produced');
      return;
    }
    try {
      const audit = await getAudit(connection, auditId);
      if (!audit) {
        sendError(res, 404, 'audit not found');
        return;
      }

      const body = await readJsonBodyOrRespond(req, res, MAX_FINALIZED_REPORT_BODY_BYTES);
      if (body === jsonBodyNotRead) return;
      const upload = parseFinalizedReportUpload(body);
      if (typeof upload === 'string') {
        sendError(res, 400, upload);
        return;
      }
      if (upload.lineage.language !== language) {
        sendError(res, 400, `the upload is for ${upload.lineage.language}, not ${language}`);
        return;
      }
      if (upload.lineage.auditId !== auditId) {
        sendError(res, 400, `the upload is for audit ${upload.lineage.auditId}`);
        return;
      }

      // The 409 that makes this safe: a finalization is corrections to one
      // exact analysis and one exact findings set. If either has moved on
      // since the bundle was fetched, the PDF describes something the audit no
      // longer says, and refusing here is what stops it reaching a client.
      const resolution = await resolveSelectedAnalysisPairForAudit(connection, auditId);
      if (resolution.kind === 'none') {
        sendError(
          res,
          409,
          'a selected analysis is required before a finalized report can be stored',
        );
        return;
      }
      const analysis = language === 'fr' ? resolution.fr : resolution.en;
      if (!analysis) {
        sendError(res, 409, `no selected ${language} analysis for this audit`);
        return;
      }
      if (analysis.analysisId !== upload.lineage.analysisId) {
        sendError(
          res,
          409,
          'the selected analysis no longer matches this upload; re-fetch the bundle and render again',
        );
        return;
      }
      if (canonicalDigest(analysis) !== upload.lineage.analysisDigest) {
        sendError(
          res,
          409,
          'the selected analysis has changed since this report was finalized; re-fetch the bundle, ' +
            'reapply the corrections and render again',
        );
        return;
      }

      const uploadHostname = new URL(audit.siteUrl).hostname;
      const auditDir = buildAuditDir(getArtifactsRoot(), uploadHostname, audit.startedAt);
      let manifest: AuditManifest;
      let findings: Finding[];
      try {
        ({ manifest, findings } = await readAuditArtifacts(
          auditDir,
          uploadHostname,
          audit.startedAt,
          artifactStore,
        ));
      } catch {
        sendError(res, 404, 'audit artifacts not found on disk or in the bucket');
        return;
      }
      const findingsProvenance = buildFindingsProvenance(findings);
      if (findingsProvenance.findingsDigest !== upload.lineage.findingsDigest) {
        sendError(
          res,
          409,
          'the findings have changed since this report was finalized; re-fetch the bundle, ' +
            'reapply the corrections and render again',
        );
        return;
      }

      const generated = await getLatestGeneratedReport(connection, auditId, language);
      if (!generated?.reportId) {
        sendError(
          res,
          409,
          `no generated ${language} report to finalize; run the pipeline report first`,
        );
        return;
      }

      const reportId = randomUUID();
      const generatedAt = new Date();
      const reportsDir = path.join(auditDir, 'reports');
      await fs.mkdir(reportsDir, { recursive: true });
      const stamp = generatedAt.toISOString().replace(/[:.]/gu, '-');
      const reportPath = path.join(reportsDir, `${stamp}-final-${language}.pdf`);
      const lightReportPath = reportPath.replace(/\.pdf$/u, '-clair.pdf');
      const overridesPath = `${reportPath}.overrides.json`;
      await fs.writeFile(reportPath, upload.pdf);
      if (upload.lightPdf !== undefined) await fs.writeFile(lightReportPath, upload.lightPdf);
      // The override file is kept beside the PDF, not only digested into the
      // row: the row proves which corrections were applied, this is what they
      // said, and the pair is the whole provenance link back to the analysis
      // whose prose the report no longer carries.
      await fs.writeFile(overridesPath, `${JSON.stringify(upload.overrides, null, 2)}\n`);

      await persistReport(connection, {
        reportId,
        auditId,
        analysisId: analysis.analysisId,
        findingsProvenance,
        // The renderer that produced these bytes, which is the operator's
        // local build and its template version, not this server's.
        rendererVersion: upload.reportTemplateVersion,
        rendererBuild: upload.rendererBuild,
        pdfDigest: pdfDigestOf(upload.pdf),
        language,
        reportTemplateVersion: upload.reportTemplateVersion,
        analysisGeneratedAt: analysis.generatedAt,
        fileRef: path.relative(auditDir, reportPath),
        generatedAt,
        renderedOnHost: osHostname(),
        origin: 'finalized',
        finalization: {
          overridesDigest: upload.overridesDigest,
          overrideCount: upload.overrides?.overrides.length ?? 0,
          uploadedAt: generatedAt,
          supersedesReportId: generated.reportId,
        },
        // Measured by the render that produced these bytes, reported by it the
        // same way the pipeline reports its own count. The digest is the part
        // the server computes itself.
        ...(upload.pageCount !== undefined ? { pageCount: upload.pageCount } : {}),
        ...(upload.lightPdf === undefined
          ? {}
          : {
              variants: {
                light: {
                  fileRef: path.relative(auditDir, lightReportPath),
                  pdfDigest: pdfDigestOf(upload.lightPdf),
                  ...(upload.lightPageCount !== undefined
                    ? { pageCount: upload.lightPageCount }
                    : {}),
                },
              },
            }),
      });

      await syncArtifactFilesToBucket(
        artifactStore,
        auditDir,
        uploadHostname,
        new Date(manifest.startedAt),
        [reportPath, overridesPath, ...(upload.lightPdf === undefined ? [] : [lightReportPath])],
      );

      sendJson(res, 201, {
        reportId,
        supersedesReportId: generated.reportId,
        overrideCount: upload.overrides?.overrides.length ?? 0,
        lightAvailable: upload.lightPdf !== undefined,
        generatedAt: generatedAt.toISOString(),
      });
    } finally {
      releaseReportProduction(auditId, 'writing');
    }
  });

  /** The pipeline render a finalization superseded, kept reachable so the
   *  operator can compare what was corrected against what was generated. */
  router.get('/api/audits/:auditId/report/:language/generated', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const language = params['language']!;
    if (!isReportLanguage(language)) {
      sendError(res, 400, 'language must be "fr" or "en"');
      return;
    }
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const report = await getLatestGeneratedReport(connection, auditId, language);
    if (!report) {
      sendError(res, 404, `no generated ${language} report for this audit`);
      return;
    }
    const generatedHostname = new URL(audit.siteUrl).hostname;
    const pdf = await readVerifiedReport(
      buildAuditDir(getArtifactsRoot(), generatedHostname, audit.startedAt),
      report,
      generatedHostname,
      audit.startedAt,
      artifactStore,
    );
    if (!pdf) {
      sendError(res, 409, 'report PDF is missing or its digest does not match');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    res.end(pdf);
  });

  router.get('/api/audits/:auditId/report/:language/preview', async ({ res, params, query }) => {
    const auditId = params['auditId']!;
    const language = params['language']!;
    if (!isReportLanguage(language)) {
      sendError(res, 400, 'language must be "fr" or "en"');
      return;
    }
    const theme = parseReportThemeQuery(query);
    if (theme === undefined) {
      sendError(res, 400, 'theme must be "dark" or "light"');
      return;
    }
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const activeBundle = await getActiveReportBundle(connection, auditId);
    if (activeBundle) {
      if (theme === 'light') {
        sendError(res, 409, 'light report variant is unavailable for an active immutable report');
        return;
      }
      if (!artifactStore) {
        sendError(res, 503, 'artifact store is not configured for the active immutable report');
        return;
      }
      try {
        const candidate = activeBundle[language];
        const pdf = await readVerifiedImmutablePdf(
          artifactStore,
          candidate.objectKey,
          candidate.pdfDigest,
        );
        res.statusCode = 200;
        res.setHeader('content-type', 'application/pdf');
        res.setHeader('etag', `"${candidate.pdfDigest}"`);
        res.end(pdf);
      } catch (error) {
        sendError(
          res,
          409,
          error instanceof Error
            ? error.message
            : 'active report bytes failed integrity verification',
        );
      }
      return;
    }
    const report = await getLatestReport(connection, auditId, language);
    if (!report || classifyReportFreshness(report, audit.findingsProvenance) !== 'fresh') {
      sendError(res, 409, `a fresh ${language} report is required for preview`);
      return;
    }
    if (resolveReportVariant(report, theme).kind === 'unavailable') {
      sendError(res, 409, `${theme} report variant is unavailable for preview`);
      return;
    }
    const previewHostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), previewHostname, audit.startedAt);
    const pdf = await readVerifiedReport(
      auditDir,
      report,
      previewHostname,
      audit.startedAt,
      artifactStore,
      theme,
    );
    if (!pdf) {
      sendError(res, 409, 'report PDF is missing or its digest does not match');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    res.end(pdf);
  });

  router.get('/api/audits/:auditId/report/:language', async ({ res, params, query }) => {
    const auditId = params['auditId']!;
    const language = params['language']!;
    if (!isReportLanguage(language)) {
      sendError(res, 400, 'language must be "fr" or "en"');
      return;
    }
    const theme = parseReportThemeQuery(query);
    if (theme === undefined) {
      sendError(res, 400, 'theme must be "dark" or "light"');
      return;
    }

    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    const activeBundle = await getActiveReportBundle(connection, auditId);
    if (activeBundle) {
      if (theme === 'light') {
        sendError(res, 409, 'light report variant is unavailable for an active immutable report');
        return;
      }
      if (!artifactStore) {
        sendError(res, 503, 'artifact store is not configured for the active immutable report');
        return;
      }
      const activeLanguage = activeBundle[language];
      try {
        const pdf = await readVerifiedImmutablePdf(
          artifactStore,
          activeLanguage.objectKey,
          activeLanguage.pdfDigest,
        );
        res.statusCode = 200;
        res.setHeader('content-type', 'application/pdf');
        res.setHeader('etag', `"${activeLanguage.pdfDigest}"`);
        res.setHeader('cache-control', 'private, no-transform');
        res.end(pdf);
      } catch (error) {
        sendError(
          res,
          409,
          error instanceof Error
            ? error.message
            : 'active report bytes failed integrity verification',
        );
      }
      return;
    }
    const report = await getLatestReport(connection, auditId, language);
    if (!report) {
      sendError(res, 404, `no ${language} report generated yet for this audit`);
      return;
    }

    const freshness = classifyReportFreshness(report, audit.findingsProvenance);
    if (freshness !== 'fresh') {
      sendError(
        res,
        409,
        `the latest ${language} report is ${freshness} and cannot be delivered; regenerate it from current analyses`,
      );
      return;
    }
    const variant = resolveReportVariant(report, theme);
    if (variant.kind === 'unavailable') {
      sendError(res, 409, `${theme} report variant is unavailable; no fallback is permitted`);
      return;
    }

    const [fr, en, approval] = await Promise.all([
      getLatestReport(connection, auditId, 'fr'),
      getLatestReport(connection, auditId, 'en'),
      getLatestReportApproval(connection, auditId),
    ]);
    // The French report is the canonical deliverable, so it is deliverable
    // whenever approval covers this exact French report - a regenerated
    // English attachment does not un-approve it. English is an attachment to
    // an approved French deliverable, so it additionally requires the French
    // report still to be the approved one.
    const deliveryApproved =
      language === 'fr'
        ? Boolean(fr && approvalCoversReport(approval, 'fr', fr, theme))
        : Boolean(
            en &&
            approvalCoversReport(approval, 'en', en, theme) &&
            fr &&
            approvalCoversReport(approval, 'fr', fr, 'dark'),
          );
    if (!deliveryApproved) {
      sendError(
        res,
        409,
        language === 'fr'
          ? 'the current French report has not been approved for delivery'
          : 'the current English report has not been approved for delivery',
      );
      return;
    }

    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    const pdf = await readVerifiedReport(
      auditDir,
      report,
      hostname,
      audit.startedAt,
      artifactStore,
      theme,
    );
    if (!pdf) {
      sendError(res, 404, `${theme} report file not found or its digest does not match`);
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('etag', `"${variant.pdfDigest}"`);
    res.end(pdf);
  });

  // Plan 037 slice 5: the four outreach-preview actions of the audit page.
  // Render and PDF share buildAuditOutreachPreviewHtml above; a refusal is
  // an expected, correct outcome (200 with the typed refusal code, so the
  // page can say why), while an unknown audit is 404 as everywhere else.
  router.get('/api/audits/:auditId/outreach-preview', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const outcome = await buildAuditOutreachPreviewHtml(connection, audit, artifactStore);
    if (outcome.state === 'refused') {
      sendJson(res, 200, { rendered: false, refusal: outcome.refusal });
      return;
    }
    sendJson(res, 200, { rendered: true, html: outcome.html });
  });

  router.get('/api/audits/:auditId/outreach-preview/pdf', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const outcome = await buildAuditOutreachPreviewHtml(connection, audit, artifactStore);
    if (outcome.state === 'refused') {
      sendJson(res, 200, { rendered: false, refusal: outcome.refusal });
      return;
    }
    const pdf = await generateOutreachPreviewPdf(outcome.html);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="apercu-${auditId}.pdf"`);
    res.end(pdf);
  });

  // Publication stays prospect-linked: the v2 preview is the scorecard of
  // one prospect's qualifying audit, so an unlinked audit refuses instead of
  // guessing an identity.
  router.post('/api/audits/:auditId/outreach-preview/publish', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const prospectId = audit.prospectId;
    if (prospectId === undefined) {
      sendJson(res, 409, { published: false, refusal: 'not-a-prospect-audit' });
      return;
    }
    let publisher;
    try {
      publisher = createConfiguredPreviewPublisher();
    } catch {
      sendError(res, 503, 'the preview bucket is not configured on this machine');
      return;
    }
    const result = await publishPreviewV3({
      store: createMongoOutreachPreviewStoreV3(connection, {
        prospectId,
      }),
      publisher,
      publicBaseUrl: getPreviewPublicBaseUrl(),
      prospectId,
      language: 'fr',
      dryRun: false,
    });
    if (result.published) {
      // The url carries the raw one-time token: never cached anywhere.
      res.setHeader('cache-control', 'no-store');
      sendJson(res, 200, {
        published: true,
        previewId: result.previewId,
        url: result.url,
        publicExpiresAt: result.publicExpiresAt,
      });
      return;
    }
    sendJson(res, 200, { published: false, refusal: result.refusal });
  });
}
