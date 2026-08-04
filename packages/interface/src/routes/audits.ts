import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import type { ReportLanguage } from '@odysseus/core';
import {
  getAudit,
  getFindingsForAudit,
  getLatestReport,
  getSeverityRollup,
  listReportLanguages,
} from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import { sendError, sendJson } from '../http-utils.js';

function isReportLanguage(value: string): value is ReportLanguage {
  return value === 'fr' || value === 'en';
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

    sendJson(res, 200, {
      auditId: audit.auditId,
      siteUrl: audit.siteUrl,
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      pagesVisited: audit.crawl.visitedCount,
      severityRollup,
      findings,
      reportLanguages,
    });
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

    const hostname = new URL(audit.siteUrl).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
    const filePath = path.join(auditDir, report.fileRef);

    // setHeader/statusCode are just object properties until the first
    // real write, so the error handler below can still safely overwrite
    // them with a JSON error response - nothing has been flushed yet in
    // the common failure case (the file is missing, so createReadStream
    // errors before any 'data' event, hence before pipe() writes).
    res.statusCode = 200;
    res.setHeader('content-type', 'application/pdf');
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) sendError(res, 404, 'report file not found on disk');
    });
    stream.pipe(res);
  });
}
