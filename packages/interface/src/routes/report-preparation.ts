/**
 * The Prepare report workflow's endpoints, plan 019 step 5. One audit-
 * scoped surface: read the preparation with its resolved bilingual
 * preview, patch the bounded operator inputs, confirm the current
 * missing-context warnings, start a cost-warned writing regeneration, and
 * approve a ready candidate. All persistence goes through the store
 * service functions; validation goes through the preparation module's
 * parse function, so an unknown option, an oversized text, or a malformed
 * shape is rejected here with 400 before it can reach storage.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Connection } from 'mongoose';
import type { AuditManifest, Finding } from '@odysseus/core';
import {
  buildReportPreparationPreview,
  isAcknowledgementCurrent,
  parseReportPreparationPatch,
  suggestJourneys,
  type JourneySuggestion,
  type ReportPreparation,
  type ReportPreparationPreview,
} from '@odysseus/core';
import type { AuditDocument } from '@odysseus/store';
import {
  approveWritingCandidate,
  clearStaleWarningAcknowledgement,
  getAudit,
  getReportPreparation,
  patchReportPreparationInputs,
  setWarningAcknowledgement,
  WritingSelectionConflictError,
} from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import { PayloadTooLargeError, readJsonBody, sendError, sendJson } from '../http-utils.js';
import {
  MissingAcknowledgementError,
  regenerateWriting,
  RegenerationConflictError,
  isWritingRegenerationInFlight,
  WritingRegenerationFailedError,
} from '../pipeline/regenerate-writing.js';

export interface PreparationView {
  preparation: ReportPreparation;
  preview: ReportPreparationPreview;
  suggestions: readonly JourneySuggestion[];
  acknowledgementCurrent: boolean;
  regenerationInFlight: boolean;
}

/** The one place assembling the preparation view: preparation plus its
 *  resolved bilingual preview, computed from the on-disk evidence. Artifacts
 *  are optional here (unlike regeneration): a missing manifest degrades the
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

  let manifest: AuditManifest | undefined;
  let findings: Finding[] | undefined;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(auditDir, 'manifest.json'), 'utf-8'));
    findings = JSON.parse(await fs.readFile(path.join(auditDir, 'findings.json'), 'utf-8'));
  } catch {
    manifest = undefined;
    findings = undefined;
  }

  const preview = buildReportPreparationPreview({
    preparation,
    commercialName: audit.manualFields?.nomCommercial?.value,
    ...(manifest !== undefined && findings !== undefined ? { manifest, findings } : {}),
  });
  return {
    preparation,
    preview,
    suggestions: suggestJourneys(
      manifest !== undefined && findings !== undefined ? { manifest, findings } : null,
    ),
    acknowledgementCurrent: isAcknowledgementCurrent(
      preparation.warningAcknowledgement,
      preview.warningDigest,
    ),
    regenerationInFlight: isWritingRegenerationInFlight(auditId),
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
  router.get('/api/audits/:auditId/report-preparation', async ({ res, params }) => {
    const audit = await readAudit(connection, params['auditId']!, res);
    if (!audit) return;
    sendJson(res, 200, await buildPreparationView(connection, audit));
  });

  router.patch('/api/audits/:auditId/report-preparation', async ({ req, res, params }) => {
    const auditId = params['auditId']!;
    const audit = await readAudit(connection, auditId, res);
    if (!audit) return;

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

    let patch;
    try {
      patch = parseReportPreparationPatch(body);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid preparation patch');
      return;
    }

    await patchReportPreparationInputs(connection, auditId, patch);
    // The acknowledgement is only remembered while the warning-relevant
    // input has not changed: recompute the digest for the new inputs and
    // prune a confirmation that no longer matches.
    const view = await buildPreparationView(connection, audit);
    await clearStaleWarningAcknowledgement(connection, auditId, view.preview.warningDigest);
    sendJson(res, 200, await buildPreparationView(connection, audit));
  });

  router.post(
    '/api/audits/:auditId/report-preparation/confirm-warnings',
    async ({ res, params }) => {
      const auditId = params['auditId']!;
      const audit = await readAudit(connection, auditId, res);
      if (!audit) return;
      // The digest is always recomputed server-side from the current inputs;
      // the client never supplies one.
      const view = await buildPreparationView(connection, audit);
      await setWarningAcknowledgement(connection, auditId, view.preview.warningDigest);
      sendJson(res, 200, await buildPreparationView(connection, audit));
    },
  );

  router.post(
    '/api/audits/:auditId/report-preparation/regenerate-writing',
    async ({ req, res, params }) => {
      const auditId = params['auditId']!;
      const audit = await readAudit(connection, auditId, res);
      if (!audit) return;

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
      const costWarningConfirmed =
        body !== null &&
        typeof body === 'object' &&
        (body as Record<string, unknown>)['costWarningConfirmed'] === true;
      if (!costWarningConfirmed) {
        sendError(res, 400, 'the model-call and cost warning must be explicitly confirmed');
        return;
      }

      try {
        const result = await regenerateWriting(connection, audit, true);
        sendJson(res, 201, result);
      } catch (error) {
        if (error instanceof MissingAcknowledgementError) {
          sendError(res, 409, error.message);
          return;
        }
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

  router.post(
    '/api/audits/:auditId/report-preparation/approve-candidate',
    async ({ res, params }) => {
      const auditId = params['auditId']!;
      const audit = await readAudit(connection, auditId, res);
      if (!audit) return;
      try {
        await approveWritingCandidate(connection, auditId);
      } catch (error) {
        if (error instanceof WritingSelectionConflictError) {
          sendError(res, 409, error.message);
          return;
        }
        sendError(res, 500, 'could not approve the writing candidate');
        return;
      }
      sendJson(res, 200, await buildPreparationView(connection, audit));
    },
  );
}
