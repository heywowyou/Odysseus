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
import type { AuditManifest, Finding } from '@odysseus/core';
import {
  buildReportPreparationPreview,
  parseReportPreparationPatch,
  suggestJourneys,
  type JourneySuggestion,
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
  WritingRegenerationFailedError,
} from '../pipeline/regenerate-writing.js';

interface PreparationView {
  preparation: ReportPreparation;
  preview: ReportPreparationPreview;
  suggestions: readonly JourneySuggestion[];
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
    async ({ res, params }) => {
      const auditId = params['auditId']!;
      const audit = await readAudit(connection, auditId, res);
      if (!audit) return;

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
