/**
 * Candidate report preview, plan 019 step 6: renders the current ready
 * writing candidate's report for one language and returns the PDF bytes
 * directly. Deliberately NOT the report stage: nothing is persisted, no
 * report row or provenance file is written, so previewing a candidate can
 * never alter the selected paid report or the dashboard's freshness state
 * (trade-off 44 keeps the paid deliverable bound to the selected pair).
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { ReportLanguage } from '@odysseus/core';
import { buildReportPreparationPreview } from '@odysseus/core';
import { generateReportPdf, REPORT_TEMPLATE_VERSION, type StoredAnalysis } from '@odysseus/report';
import { readOdysseusBuildId } from '@odysseus/scanner';
import {
  getAnalysisById,
  getAuditManualFields,
  getReportPreparation,
  type AuditDocument,
} from '@odysseus/store';
import { RegenerationConflictError } from './regenerate-writing.js';
import { readAuditEvidence } from './audit-evidence.js';

export async function renderCandidatePreview(
  connection: Connection,
  audit: AuditDocument,
  language: ReportLanguage,
): Promise<Buffer> {
  const auditId = audit.auditId;
  const preparation = await getReportPreparation(connection, auditId);
  const candidate = preparation.writingSelection?.candidate;
  if (!candidate || candidate.status !== 'ready') {
    throw new RegenerationConflictError(
      'odysseus: a ready writing candidate is required for a preview',
    );
  }

  const fr = await getAnalysisById(connection, auditId, candidate.pair.frAnalysisId);
  const en = await getAnalysisById(connection, auditId, candidate.pair.enAnalysisId);
  if (!fr || !en) {
    throw new RegenerationConflictError(
      'odysseus: the ready writing candidate no longer refers to persisted analyses',
    );
  }
  const analysis = language === 'fr' ? fr : en;

  const { auditDir, manifest, findings } = await readAuditEvidence(audit);
  const manualFields = await getAuditManualFields(connection, auditId);
  const preview = buildReportPreparationPreview({
    preparation,
    commercialName: manualFields?.nomCommercial?.value,
    manifest,
    findings,
  });

  const { pdf } = await generateReportPdf({
    auditDir,
    manifest,
    findings,
    renderMetadata: {
      reportId: randomUUID(),
      renderedAt: new Date(),
      rendererBuild: readOdysseusBuildId(),
      templateVersion: REPORT_TEMPLATE_VERSION,
    },
    analysis: analysis as StoredAnalysis,
    ...(manualFields !== undefined ? { manualFields } : {}),
    preparation: preview[language],
  });
  return pdf;
}
