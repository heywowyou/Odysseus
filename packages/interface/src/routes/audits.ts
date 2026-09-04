import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
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
  getAudit,
  getFindingsForAudit,
  getLatestReport,
  getLatestReportApproval,
  getSeverityRollup,
  approvalMatchesReportPair,
  listReportLanguages,
  persistReportApproval,
  resolveSelectedAnalysisPairForAudit,
  setAuditManualFields,
  type ReportDocument,
  type SelectedAuditAnalysisPairResolution,
} from '@odysseus/store';
import { buildArtifactBucketKey, buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import {
  classifyReportFreshness,
  type ReportFreshness,
  type StoredAnalysis,
} from '@odysseus/report';
import type { Router } from '../router.js';
import { PayloadTooLargeError, readJsonBody, sendError, sendJson } from '../http-utils.js';
import { lookupOperatorProfile } from '../sirene/sirene-cache.js';
import { runAllReportsStage } from '../pipeline/report-stage.js';
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
  const digest = `sha256:${createHash('sha256').update(pdf).digest('hex')}`;
  return digest === report.pdfDigest ? pdf : undefined;
}

/** Pure over already-fetched reports and resolution, so a caller that has
 *  already paid for those reads (the dashboard's GET handler, which needs
 *  them for other fields anyway) does not pay for them twice. */
async function verifyFreshPair(
  fr: ReportDocument | null,
  en: ReportDocument | null,
  resolution: SelectedAuditAnalysisPairResolution,
  auditDir: string,
  currentFindings: OptionalFindingsProvenance,
  hostname: string,
  startedAt: Date,
  store: ArtifactStore | undefined,
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
  const [frPdf, enPdf] = await Promise.all([
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

    const [findings, severityRollup, reportLanguages, selectedPair, approval, frReport, enReport] =
      await Promise.all([
        getFindingsForAudit(connection, auditId),
        getSeverityRollup(connection, auditId),
        listReportLanguages(connection, auditId),
        resolveSelectedAnalysisPairForAudit(connection, auditId),
        getLatestReportApproval(connection, auditId),
        getLatestReport(connection, auditId, 'fr'),
        getLatestReport(connection, auditId, 'en'),
      ]);
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
      };
    });
    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    const verifiedPair = await verifyFreshPair(
      frReport,
      enReport,
      selectedPair,
      auditDir,
      audit.findingsProvenance,
      hostname,
      audit.startedAt,
      artifactStore,
    );
    const analysed = Boolean(
      selectedPair.kind !== 'none' &&
      provenanceMatches(selectedPair.fr.findingsProvenance, audit.findingsProvenance) &&
      provenanceMatches(selectedPair.en.findingsProvenance, audit.findingsProvenance),
    );
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

    sendJson(res, 200, {
      auditId: audit.auditId,
      siteUrl: audit.siteUrl,
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      pagesVisited: audit.crawl.visitedCount,
      coverageSummary: summarizeAuditCoverage(audit),
      severityRollup,
      findings,
      reportLanguages,
      reports,
      lifecycle,
      approval: approved ? approval : null,
      manualFields: audit.manualFields,
      ...(audit.siteSignals?.hasTransactionalFlow !== undefined
        ? { detectedTransactionalFlow: audit.siteSignals.hasTransactionalFlow }
        : {}),
    });
  });

  router.post('/api/audits/:auditId/manual-fields/siren-preview', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendError(res, 413, 'request body is too large');
        return;
      }
      sendError(res, 400, 'request body must be valid JSON');
      return;
    }
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
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendError(res, 413, 'request body is too large');
        return;
      }
      sendError(res, 400, 'request body must be valid JSON');
      return;
    }
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
  // `odysseus report <dir> --all` does - no rescan, no new LLM call. The
  // saved manualFields (siren included) are picked up automatically by
  // runReportStage's own fresh-recompute step, not passed explicitly here.
  router.post('/api/audits/:auditId/regenerate-report', async ({ res, params }) => {
    const auditId = params['auditId']!;
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
      const [manifestBytes, findingsBytes] = await Promise.all([
        resolveArtifactFile(
          path.join(auditDir, 'manifest.json'),
          buildArtifactBucketKey(hostname, audit.startedAt, 'manifest.json'),
          artifactStore,
        ),
        resolveArtifactFile(
          path.join(auditDir, 'findings.json'),
          buildArtifactBucketKey(hostname, audit.startedAt, 'findings.json'),
          artifactStore,
        ),
      ]);
      manifest = JSON.parse(manifestBytes.toString('utf-8'));
      findings = JSON.parse(findingsBytes.toString('utf-8'));
    } catch {
      sendError(res, 404, 'audit artifacts not found on disk or in the bucket');
      return;
    }

    // Selection-aware resolution (plan 019): the selected exact pair, or
    // the legacy latest complete pair for audits without a selection. A
    // ready-but-unapproved candidate is never rendered as the paid report.
    const resolution = await resolveSelectedAnalysisPairForAudit(connection, auditId);
    if (resolution.kind === 'none') {
      sendError(
        res,
        409,
        'a complete bilingual analysis pair is required before a report can be regenerated',
      );
      return;
    }
    const fr: StoredAnalysis = { ...resolution.fr };
    const en: StoredAnalysis = { ...resolution.en };

    try {
      const results = await runAllReportsStage(
        auditDir,
        manifest,
        findings,
        { fr, en },
        connection,
      );
      sendJson(res, 200, { reports: results });
    } catch (error) {
      sendError(res, 409, error instanceof Error ? error.message : 'could not regenerate reports');
    }
  });

  router.post('/api/audits/:auditId/approve-reports', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
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
    const actualDigest = `sha256:${createHash('sha256').update(pdf).digest('hex')}`;
    if (actualDigest !== report.pdfDigest) {
      sendError(res, 409, 'report PDF digest does not match its provenance record');
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    res.end(pdf);
  });
}
