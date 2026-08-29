import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  isValidSiren,
  type AuditManifest,
  type AuditManualFields,
  type Finding,
  type LlmOutput,
  type ReportLanguage,
  type StatSector,
} from '@odysseus/core';
import {
  getAudit,
  getFindingsForAudit,
  getLatestReport,
  getSeverityRollup,
  listReportLanguages,
  setAuditManualFields,
} from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import {
  classifyReportFreshness,
  type ReportFreshness,
  type StoredAnalysis,
} from '@odysseus/report';
import type { Router } from '../router.js';
import { PayloadTooLargeError, readJsonBody, sendError, sendJson } from '../http-utils.js';
import { lookupOperatorProfile } from '../sirene/sirene-cache.js';
import { runAllReportsStage } from '../pipeline/report-stage.js';

/** analyses/<timestamp>-<lang>.json filenames sort lexicographically in
 *  chronological order, so the last match is the latest analysis for the
 *  requested language - same idiom the CLI's `odysseus report` command
 *  already uses (packages/cli/src/commands/report.ts), duplicated here
 *  rather than shared: both are small, boundary-local helpers reading off
 *  disk, not logic either package should depend on the other for. */
async function findLatestAnalysisFile(
  analysesDir: string,
  language: ReportLanguage,
): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await fs.readdir(analysesDir);
  } catch {
    return undefined;
  }
  const matching = entries.filter((name) => name.endsWith(`-${language}.json`)).sort();
  const latest = matching.at(-1);
  return latest ? path.join(analysesDir, latest) : undefined;
}

async function readAnalysis(analysisPath: string): Promise<StoredAnalysis> {
  const raw = await fs.readFile(analysisPath, 'utf-8');
  const parsed = JSON.parse(raw) as LlmOutput & {
    auditId: string;
    language: ReportLanguage;
    model: string;
    temperature: number;
    generatedAt: string;
  };
  return { ...parsed, generatedAt: new Date(parsed.generatedAt) };
}

function isReportLanguage(value: string): value is ReportLanguage {
  return value === 'fr' || value === 'en';
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

  return result;
}

export function registerAuditRoutes(router: Router, connection: Connection): void {
  router.get('/api/audits/:auditId', async ({ res, params }) => {
    const auditId = params['auditId']!;
    const audit = await getAudit(connection, auditId);
    if (!audit) {
      sendError(res, 404, 'audit not found');
      return;
    }

    const [findings, severityRollup, reportLanguages] = await Promise.all([
      getFindingsForAudit(connection, auditId),
      getSeverityRollup(connection, auditId),
      listReportLanguages(connection, auditId),
    ]);
    const reports = await Promise.all(
      reportLanguages.map(async (language) => {
        const report = await getLatestReport(connection, auditId, language);
        return {
          language,
          status: (report
            ? classifyReportFreshness(report, audit.findingsProvenance)
            : 'unverified') as ReportFreshness,
        };
      }),
    );

    sendJson(res, 200, {
      auditId: audit.auditId,
      siteUrl: audit.siteUrl,
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      pagesVisited: audit.crawl.visitedCount,
      severityRollup,
      findings,
      reportLanguages,
      reports,
      manualFields: audit.manualFields,
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
  // each language's already-existing latest analysis, exactly what
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
      manifest = JSON.parse(await fs.readFile(path.join(auditDir, 'manifest.json'), 'utf-8'));
      findings = JSON.parse(await fs.readFile(path.join(auditDir, 'findings.json'), 'utf-8'));
    } catch {
      sendError(res, 404, 'audit artifacts not found on disk');
      return;
    }

    const analysesDir = path.join(auditDir, 'analyses');
    const [frPath, enPath] = await Promise.all([
      findLatestAnalysisFile(analysesDir, 'fr'),
      findLatestAnalysisFile(analysesDir, 'en'),
    ]);
    if (!frPath || !enPath) {
      sendError(
        res,
        409,
        'both fr and en analyses must already exist before a report can be regenerated',
      );
      return;
    }
    const [fr, en] = await Promise.all([readAnalysis(frPath), readAnalysis(enPath)]);

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

    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    const filePath = path.join(auditDir, report.fileRef);

    let pdf: Buffer;
    try {
      pdf = await fs.readFile(filePath);
    } catch {
      sendError(res, 404, 'report file not found on disk');
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
