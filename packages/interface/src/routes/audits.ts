import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  buildOutreachPreviewSummary,
  coverageFactsFromAudit,
  isValidSiren,
  summarizeAuditCoverage,
  type AuditManifest,
  type AuditManualFields,
  type Finding,
  type FindingsProvenance,
  type ReportLanguage,
  type StatSector,
} from '@odysseus/core';
import {
  createJobModel,
  findLatestLiveV2PreviewForCandidate,
  getAudit,
  getAuditRuntimeFields,
  getFindingsForAudit,
  getHotelCandidate,
  getLatestReport,
  getLatestReportApproval,
  getSeverityRollup,
  approvalMatchesReportPair,
  listReportLanguages,
  persistReportApproval,
  resolveOutreachAuditForCandidate,
  resolveSelectedAnalysisPairForAudit,
  setAuditManualFields,
  type AuditDocumentFields,
  type JobDocument,
  type ReportDocument,
  type SelectedAuditAnalysisPairResolution,
} from '@odysseus/store';
import { buildArtifactBucketKey, buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import {
  classifyReportFreshness,
  generateOutreachPreviewHtmlV2,
  generateOutreachPreviewPdf,
  OUTREACH_PROOF_CARD_COPY,
  remediationFor,
  RULE_TRANSLATIONS_FR,
  type ReportFreshness,
} from '@odysseus/report';
import { getPreviewPublicBaseUrl } from '../config.js';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { createMongoOutreachPreviewStoreV2 } from '../outreach/mongo-outreach-preview-store-v2.js';
import { previewLinks } from '../outreach/publish-preview.js';
import {
  buildOutreachPreviewSummaryV2,
  publishPreviewV2,
  type PublishPreviewV2Refusal,
} from '../outreach/publish-preview-v2.js';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';
import type { Router } from '../router.js';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import { lookupOperatorProfile } from '../sirene/sirene-cache.js';
import { pdfDigestOf } from '../pipeline/pdf-digest.js';
import { makeReportReady } from '../pipeline/make-report-ready.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';

function isReportLanguage(value: string): value is ReportLanguage {
  return value === 'fr' || value === 'en';
}

type CurrentReportPair = { fr: ReportDocument; en: ReportDocument };

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
): Promise<Buffer | undefined> {
  if (!report.pdfDigest) return undefined;
  let pdf: Buffer;
  try {
    pdf = await resolveArtifactFile(
      path.join(auditDir, report.fileRef),
      buildArtifactBucketKey(hostname, startedAt, report.fileRef),
      store,
    );
  } catch {
    return undefined;
  }
  const digest = pdfDigestOf(pdf);
  return digest === report.pdfDigest ? pdf : undefined;
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
): Promise<{ reports: CurrentReportPair; pdfs: { fr: Buffer; en: Buffer } } | undefined> {
  // Plan 019: the current analysis pair is the selected one (or, for a
  // legacy audit without a selection, the latest complete pair from the
  // one centralized selector), never simply the newest persisted analysis
  // - a finished candidate must not become effective before approval.
  if (resolution.kind === 'none') return undefined;
  const frAnalysis = resolution.fr;
  const enAnalysis = resolution.en;
  if (
    !fr ||
    !en ||
    !fr.reportId ||
    !en.reportId ||
    fr.analysisId !== frAnalysis.analysisId ||
    en.analysisId !== enAnalysis.analysisId ||
    !provenanceMatches(frAnalysis.findingsProvenance, currentFindings) ||
    !provenanceMatches(enAnalysis.findingsProvenance, currentFindings) ||
    classifyReportFreshness(fr, currentFindings) !== 'fresh' ||
    classifyReportFreshness(en, currentFindings) !== 'fresh'
  )
    return undefined;
  const [frPdf, enPdf] = preReadPdfs
    ? [preReadPdfs.fr, preReadPdfs.en]
    : await Promise.all([
        readVerifiedReport(auditDir, fr, hostname, startedAt, store),
        readVerifiedReport(auditDir, en, hostname, startedAt, store),
      ]);
  if (!frPdf || !enPdf) return undefined;
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
): Promise<{ reports: CurrentReportPair; pdfs: { fr: Buffer; en: Buffer } } | undefined> {
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
  'revenueBand',
  'declarationContactEmail',
  'recipientName',
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

/** Plan 037 slice 5: the outreach preview section of the audit detail page.
 *  One build path for both the on-page render and the operator PDF: a
 *  candidate-linked audit goes through the exact resolution and summary
 *  build publication uses, so what the operator inspects here is what a
 *  published link would serve; any other audit gets an internal view built
 *  straight from the stored audit and findings (French, no recipient
 *  facts). Refusal names are the stable API strings the store and the v2
 *  publish path already use; they are never translated. */
type OutreachPreviewBuildOutcome =
  { state: 'rendered'; html: string } | { state: 'refused'; refusal: PublishPreviewV2Refusal };

async function buildAuditOutreachPreviewHtml(
  connection: Connection,
  audit: AuditDocumentFields,
): Promise<OutreachPreviewBuildOutcome> {
  const publicBaseUrl = getPreviewPublicBaseUrl();
  const candidateId = audit.outreach?.candidateId;

  if (candidateId !== undefined) {
    const resolution = await resolveOutreachAuditForCandidate(connection, candidateId);
    if (resolution.state === 'refused') {
      return { state: 'refused', refusal: resolution.reason };
    }
    const store = createMongoOutreachPreviewStoreV2(connection, {
      qualificationVersion: CURRENT_QUALIFICATION_VERSION,
    });
    const row = await store.findPublicationRow(candidateId);
    if ('refused' in row) return { state: 'refused', refusal: row.refused };
    const built = buildOutreachPreviewSummaryV2({ row, language: 'fr', publicBaseUrl });
    if ('refused' in built) return { state: 'refused', refusal: built.refused };
    // Validates and lints; throws on either, so nothing half-formed is shown.
    return { state: 'rendered', html: generateOutreachPreviewHtmlV2(built.summary) };
  }

  const coverage = coverageFactsFromAudit(summarizeAuditCoverage(audit));
  if (coverage === undefined) {
    return { state: 'refused', refusal: 'coverage-incomplete' };
  }
  const findings = await getFindingsForAudit(connection, audit.auditId);
  const built = buildOutreachPreviewSummary({
    auditId: audit.auditId,
    observedAt: audit.finishedAt,
    coverage,
    findings,
    recipient: {
      businessName: audit.manualFields?.nomCommercial?.value ?? 'Le site audité',
      dataOrigins: ['public-website'],
    },
    links: previewLinks(publicBaseUrl),
    language: 'fr',
    facts: { state: 'omitted' },
    proofCardCopy: (ruleId) => OUTREACH_PROOF_CARD_COPY[ruleId],
  });
  if (built.state === 'refused') {
    return { state: 'refused', refusal: built.reason };
  }
  return { state: 'rendered', html: generateOutreachPreviewHtmlV2(built.summary) };
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
    ] = await Promise.all([
      getFindingsForAudit(connection, auditId),
      getSeverityRollup(connection, auditId),
      listReportLanguages(connection, auditId),
      resolveSelectedAnalysisPairForAudit(connection, auditId),
      getLatestReportApproval(connection, auditId),
      getLatestReport(connection, auditId, 'fr'),
      getLatestReport(connection, auditId, 'en'),
      getFailedJobForAudit(connection, auditId),
    ]);
    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    // Issue #91: resolve each language's PDF availability up front, so the
    // dashboard can render report rows that tell "the report is fine but
    // elsewhere" apart from "the report is gone" instead of asserting a
    // freshness the endpoints cannot honour. These are the same
    // digest-verified reads verifyFreshPair consumes below, so each
    // language's PDF is read at most once per request (issue #139) and the
    // buffers are shared; a bucket hit is cached locally by
    // resolveArtifactFile, so one dashboard visit repairs availability for
    // the next.
    const [frPdf, enPdf] = await Promise.all([
      frReport === null
        ? Promise.resolve(undefined)
        : readVerifiedReport(auditDir, frReport, hostname, audit.startedAt, artifactStore),
      enReport === null
        ? Promise.resolve(undefined)
        : readVerifiedReport(auditDir, enReport, hostname, audit.startedAt, artifactStore),
    ]);
    const frPdfAvailable = frPdf !== undefined;
    const enPdfAvailable = enPdf !== undefined;
    const reports = (['fr', 'en'] as const).map((language) => {
      const report = language === 'fr' ? frReport : enReport;
      return {
        language,
        status: (report
          ? classifyReportFreshness(report, audit.findingsProvenance)
          : 'unverified') as ReportFreshness,
        // Optional measured page count (plan 018), omitted entirely for
        // a legacy document without one: the dashboard's length warning
        // must never be derived from an inferred value.
        ...(report?.pageCount !== undefined ? { pageCount: report.pageCount } : {}),
        pdfAvailable: language === 'fr' ? frPdfAvailable : enPdfAvailable,
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
      provenanceMatches(selectedPair.en.findingsProvenance, audit.findingsProvenance),
    ); // Plan 032 (issue #162): the selected pair was produced by the audit
    // fallback gate, so its reports carry no model-written analysis. The
    // operator sees why the report has no themes instead of reading the
    // absence as a failure. Absent pair reads as false: no analysis exists
    // to be a fallback one.
    const analysisIsStaticFallback =
      selectedPair.kind !== 'none' &&
      (selectedPair.fr.generationMode === 'static-fallback' ||
        selectedPair.en.generationMode === 'static-fallback');
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
    // Plan 037 slice 5: prospecting provenance and current preview state,
    // so the audit page knows which outreach actions exist without a
    // second request. A non-candidate audit reads as null/false.
    const outreachCandidateId = audit.outreach?.candidateId ?? null;
    const hasLiveV2Preview =
      outreachCandidateId !== null &&
      (await findLatestLiveV2PreviewForCandidate(connection, outreachCandidateId)) !== null;

    // Plan 045 slice 1.4: the hotel this audit is about, from either
    // association a real audit can carry - prospecting provenance
    // (outreach) or a plain domain link (hotelLink). Never both are read
    // as separate facts here: whichever is present names the same
    // candidate, per linkAuditToHotelByDomain's own never-overwrite rule.
    const hotelCandidateId = outreachCandidateId ?? audit.hotelLink?.candidateId ?? null;
    const hotelCandidate =
      hotelCandidateId !== null ? await getHotelCandidate(connection, hotelCandidateId) : null;

    sendJson(res, 200, {
      auditId: audit.auditId,
      siteUrl: audit.siteUrl,
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      pagesVisited: audit.crawl.visitedCount,
      coverageSummary: summarizeAuditCoverage(audit),
      severityRollup,
      findings,
      // Issue #93: reviewed FR/EN copy per rule id referenced by the
      // findings above.
      ruleCopy: buildRuleCopy(findings),
      reportLanguages,
      reports,
      lifecycle,
      analysisIsStaticFallback,
      approval: approved ? approval : null,
      manualFields: audit.manualFields,
      outreach: { candidateId: outreachCandidateId, hasLiveV2Preview },
      hotel:
        hotelCandidate !== null
          ? { candidateId: hotelCandidate.candidateId, name: hotelCandidate.name }
          : null,
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
      const manualFields = await setAuditManualFields(connection, auditId, partial);
      sendJson(res, 200, { manualFields });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'could not save manual fields');
    }
  });

  // Manual-input-layer milestone: re-renders both language reports from
  // the audit's selected analysis pair (plan 019), exactly what
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
              'a complete bilingual analysis pair is required before a report can be regenerated; ' +
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
      sendError(
        res,
        409,
        'a complete, fresh, digest-verified French and English report pair is required',
      );
      return;
    }
    const approval = {
      approvalId: randomUUID(),
      auditId,
      fr: { reportId: pair.reports.fr.reportId!, pdfDigest: pair.reports.fr.pdfDigest! },
      en: { reportId: pair.reports.en.reportId!, pdfDigest: pair.reports.en.pdfDigest! },
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
          current.reports.en.reportId !== pair.reports.en.reportId
        ) {
          throw new Error('report pair changed during approval');
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

  router.get('/api/audits/:auditId/report/:language/preview', async ({ res, params }) => {
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
    const report = await getLatestReport(connection, auditId, language);
    if (!report || classifyReportFreshness(report, audit.findingsProvenance) !== 'fresh') {
      sendError(res, 409, `a fresh ${language} report is required for preview`);
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
    );
    if (!pdf) {
      sendError(res, 409, 'report PDF is missing or its digest does not match');
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    res.end(pdf);
  });

  router.get('/api/audits/:auditId/report/:language', async ({ res, params }) => {
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

    const pair = await Promise.all([
      getLatestReport(connection, auditId, 'fr'),
      getLatestReport(connection, auditId, 'en'),
      getLatestReportApproval(connection, auditId),
    ]);
    const [fr, en, approval] = pair;
    if (!fr || !en || !approvalMatchesReportPair(approval, { fr, en })) {
      sendError(res, 409, 'the current bilingual report pair has not been approved for delivery');
      return;
    }

    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    const filePath = path.join(auditDir, report.fileRef);

    let pdf: Buffer;
    try {
      pdf = await resolveArtifactFile(
        filePath,
        buildArtifactBucketKey(hostname, audit.startedAt, report.fileRef),
        artifactStore,
      );
    } catch {
      sendError(res, 404, 'report file not found on disk or in the bucket');
      return;
    }
    const actualDigest = pdfDigestOf(pdf);
    if (actualDigest !== report.pdfDigest) {
      sendError(res, 409, 'report PDF digest does not match its provenance record');
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
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
    const outcome = await buildAuditOutreachPreviewHtml(connection, audit);
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
    const outcome = await buildAuditOutreachPreviewHtml(connection, audit);
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

  // Publication stays candidate-linked only: the v2 preview is the
  // scorecard of one candidate's resolved outreach audit, so an audit with
  // no outreach provenance refuses instead of guessing a candidate.
  router.post('/api/audits/:auditId/outreach-preview/publish', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }
    const candidateId = audit.outreach?.candidateId;
    if (candidateId === undefined) {
      sendJson(res, 409, { published: false, refusal: 'not-an-outreach-audit' });
      return;
    }
    let publisher;
    try {
      publisher = createConfiguredPreviewPublisher();
    } catch {
      sendError(res, 503, 'the preview bucket is not configured on this machine');
      return;
    }
    const result = await publishPreviewV2({
      store: createMongoOutreachPreviewStoreV2(connection, {
        qualificationVersion: CURRENT_QUALIFICATION_VERSION,
      }),
      publisher,
      publicBaseUrl: getPreviewPublicBaseUrl(),
      candidateId,
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
