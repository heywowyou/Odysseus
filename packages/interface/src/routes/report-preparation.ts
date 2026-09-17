/**
 * The Prepare report workflow's endpoints, plan 019 step 5. One audit-
 * scoped surface: read the preparation with its resolved bilingual
 * preview, patch the bounded operator inputs, and start a cost-warned
 * writing regeneration (which approves and renders inline - plan 045
 * section 2.1). All persistence goes through the store service functions;
 * validation goes through the preparation module's parse function, so an
 * unknown option, an oversized text, or a malformed shape is rejected here
 * with 400 before it can reach storage.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Connection } from 'mongoose';
import type { Finding } from '@odysseus/core';
import {
  buildReportPreparationPreview,
  parseReportPreparationPatch,
  type ReportPreparation,
  type ReportPreparationPreview,
} from '@odysseus/core';
import type { AuditDocument } from '@odysseus/store';
import { getAudit, getReportPreparation, patchReportPreparationInputs } from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import {
  regenerateWriting,
  RegenerationConflictError,
  isWritingRegenerationInFlight,
  lastWritingRunOutcome,
  recordWritingRunOutcome,
  type WritingRunOutcome,
  WritingRegenerationFailedError,
} from '../pipeline/regenerate-writing.js';
import {
  reportProductionState,
  type ReportProductionState,
} from '../pipeline/report-production-state.js';

function lastWritingRunField(auditId: string): { lastWritingRun?: WritingRunOutcome } {
  const outcome = lastWritingRunOutcome(auditId);
  return outcome === undefined ? {} : { lastWritingRun: outcome };
}

interface PreparationView {
  preparation: ReportPreparation;
  preview: ReportPreparationPreview;
  regenerationInFlight: boolean;
  lastWritingRun?: WritingRunOutcome;
  /** Issue #376: the canonical production stage every panel control reads. */
  production: ReportProductionState;
}

/** The one place assembling the preparation view: preparation plus its
 *  resolved bilingual preview, computed from the on-disk findings. Artifacts
 *  are optional here (unlike regeneration): missing findings degrade the
 *  preview to evidence-unavailable instead of failing the read. */
async function buildPreparationView(
  connection: Connection,
  audit: AuditDocument,
): Promise<PreparationView> {
  const auditId = audit.auditId;
  const preparation = await getReportPreparation(connection, auditId);
  const auditDir = buildAuditDir(
    getArtifactsRoot(),
    new URL(audit.siteUrl).hostname,
    audit.startedAt,
  );

  let findings: Finding[] | undefined;
  try {
    findings = JSON.parse(await fs.readFile(path.join(auditDir, 'findings.json'), 'utf-8'));
  } catch {
    findings = undefined;
  }

  const preview = buildReportPreparationPreview({
    preparation,
    commercialName: audit.manualFields?.nomCommercial?.value,
    findings,
  });
  return {
    preparation,
    preview,
    regenerationInFlight: isWritingRegenerationInFlight(auditId),
    ...lastWritingRunField(auditId),
    production: reportProductionState(auditId),
  };
}

async function readAudit(
  connection: Connection,
  auditId: string,
  res: import('node:http').ServerResponse,
): Promise<AuditDocument | undefined> {
  const audit = await getAudit(connection, auditId);
  if (!audit) {
    sendError(res, 404, 'audit not found');
    return undefined;
  }
  return audit;
}

export function registerReportPreparationRoutes(router: Router, connection: Connection): void {
  const artifactStore = createConfiguredArtifactStore();

  router.get('/api/audits/:auditId/report-preparation', async ({ res, params }) => {
    const audit = await readAudit(connection, params['auditId']!, res);
    if (!audit) return;
    sendJson(res, 200, await buildPreparationView(connection, audit));
  });

  router.patch('/api/audits/:auditId/report-preparation', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const audit = await readAudit(connection, auditId, res);
    if (!audit) return;

    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;

    let patch;
    try {
      patch = parseReportPreparationPatch(body);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid preparation patch');
      return;
    }

    await patchReportPreparationInputs(connection, auditId, patch);
    sendJson(res, 200, await buildPreparationView(connection, audit));
  });

  router.post(
    '/api/audits/:auditId/report-preparation/regenerate-writing',
    async ({ res, params, query }) => {
      const auditId = params['auditId']!;
      const audit = await readAudit(connection, auditId, res);
      if (!audit) return;

      // Issue #281: a writing run takes minutes, longer than a dashboard
      // request may stay open. In async mode it runs as tracked background
      // work: the in-flight marker is taken before the first await, the page
      // polls the preparation view, and the outcome is kept for it to read.
      if (query.get('async') === 'true') {
        if (isWritingRegenerationInFlight(auditId)) {
          sendError(res, 409, 'odysseus: a writing regeneration is already running for this audit');
          return;
        }
        const run = regenerateWriting(connection, audit, artifactStore);
        run.then(
          (result) =>
            recordWritingRunOutcome(auditId, {
              status: 'succeeded',
              pdfsGenerated: result.pdfs.kind === 'generated',
              ...(result.pdfs.kind === 'refused' ? { pdfsRefusedReason: result.pdfs.reason } : {}),
              finishedAt: new Date().toISOString(),
            }),
          (error: unknown) =>
            recordWritingRunOutcome(auditId, {
              status: 'failed',
              message: error instanceof Error ? error.message : 'could not regenerate writing',
              finishedAt: new Date().toISOString(),
            }),
        );
        sendJson(res, 202, { started: true });
        return;
      }

      try {
        const result = await regenerateWriting(connection, audit, artifactStore);
        sendJson(res, 201, result);
      } catch (error) {
        if (
          error instanceof RegenerationConflictError ||
          error instanceof WritingRegenerationFailedError
        ) {
          sendError(res, 409, error.message);
          return;
        }
        sendError(res, 500, 'could not regenerate writing');
      }
    },
  );
}
