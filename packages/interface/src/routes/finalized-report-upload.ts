/**
 * Plan 072: validating what the operator's upload script posts.
 *
 * The body carries a whole PDF base64-encoded, so the parsing is worth its
 * own module and its own tests: a malformed upload must be a 400 naming what
 * is wrong, never a row pointing at bytes nobody can open.
 *
 * The lineage comes from the override file itself when there is one - it
 * already carries the audit, the language and both digests - so there is no
 * second copy of those to disagree with it. A finalization with no
 * corrections (a re-render on newer code, nothing rewritten) has no override
 * file, and then the lineage is given directly.
 */

import { createHash } from 'node:crypto';
import {
  findOverrideLineageMismatch,
  writingOverrideFileSchema,
  type WritingOverrideFile,
} from '@odysseus/llm';
import type { ReportLanguage } from '@odysseus/core';

export interface FinalizedReportUpload {
  lineage: {
    auditId: string;
    language: ReportLanguage;
    analysisId: string;
    analysisDigest: string;
    findingsDigest: string;
  };
  overrides: WritingOverrideFile | undefined;
  /** SHA-256 of the override file as uploaded, or of the empty set when the
   *  finalization changed no prose. Computed here, never taken from the
   *  client. */
  overridesDigest: string;
  pdf: Buffer;
  rendererBuild: string;
  reportTemplateVersion: number;
  pageCount: number | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The upload, or the message to answer 400 with. */
export function parseFinalizedReportUpload(body: unknown): FinalizedReportUpload | string {
  const root = asRecord(body);
  if (!root) return 'request body must be a JSON object';

  const lineageRaw = asRecord(root['lineage']);
  if (!lineageRaw) return 'lineage is required';
  const { auditId, language, analysisId, analysisDigest, findingsDigest } = lineageRaw;
  if (typeof auditId !== 'string' || auditId === '') return 'lineage.auditId is required';
  if (language !== 'fr' && language !== 'en') return 'lineage.language must be "fr" or "en"';
  if (typeof analysisId !== 'string' || analysisId === '') return 'lineage.analysisId is required';
  if (typeof analysisDigest !== 'string' || analysisDigest === '') {
    return 'lineage.analysisDigest is required';
  }
  if (typeof findingsDigest !== 'string' || findingsDigest === '') {
    return 'lineage.findingsDigest is required';
  }
  const lineage: FinalizedReportUpload['lineage'] = {
    auditId,
    language,
    analysisId,
    analysisDigest,
    findingsDigest,
  };

  let overrides: WritingOverrideFile | undefined;
  if (root['overrides'] !== undefined && root['overrides'] !== null) {
    const parsed = writingOverrideFileSchema.safeParse(root['overrides']);
    if (!parsed.success) {
      return `overrides is not a valid override file: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`;
    }
    // The override file's own binding must agree with the lineage the upload
    // declares, or there is no single answer to "which analysis is this".
    const mismatch = findOverrideLineageMismatch(parsed.data, lineage);
    if (mismatch !== undefined) return `overrides do not match the declared lineage: ${mismatch}`;
    overrides = parsed.data;
  }

  const pdfBase64 = root['pdfBase64'];
  if (typeof pdfBase64 !== 'string' || pdfBase64 === '') return 'pdfBase64 is required';
  const pdf = Buffer.from(pdfBase64, 'base64');
  // Buffer.from silently drops anything that is not base64, so a truncated
  // or mistyped payload has to be caught by what it decodes to.
  if (pdf.length === 0 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return 'pdfBase64 does not decode to a PDF';
  }

  const rendererBuild = root['rendererBuild'];
  if (typeof rendererBuild !== 'string' || rendererBuild === '') return 'rendererBuild is required';
  const reportTemplateVersion = root['reportTemplateVersion'];
  if (typeof reportTemplateVersion !== 'number' || !Number.isInteger(reportTemplateVersion)) {
    return 'reportTemplateVersion must be an integer';
  }
  const pageCountRaw = root['pageCount'];
  if (
    pageCountRaw !== undefined &&
    (typeof pageCountRaw !== 'number' || !Number.isInteger(pageCountRaw) || pageCountRaw <= 0)
  ) {
    return 'pageCount must be a positive integer when given';
  }

  return {
    lineage,
    overrides,
    overridesDigest: `sha256:${createHash('sha256')
      .update(overrides === undefined ? '' : JSON.stringify(overrides))
      .digest('hex')}`,
    pdf,
    rendererBuild,
    reportTemplateVersion,
    pageCount: pageCountRaw as number | undefined,
  };
}
