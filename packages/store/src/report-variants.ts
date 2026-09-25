import type { ReportTheme } from '@odysseus/core';
import type { ReportDocument, ReportVariantDocument } from './schemas/report.schema.js';

export type ReportVariantResolution =
  | {
      kind: 'available';
      theme: ReportTheme;
      fileRef: string;
      pdfDigest: string;
      pageCount?: number;
    }
  | {
      kind: 'unavailable';
      theme: ReportTheme;
      reason: 'dark-artifact-unavailable' | 'light-variant-unavailable';
    };

type ReportVariantSource = Pick<ReportDocument, 'fileRef' | 'pdfDigest' | 'pageCount' | 'variants'>;

function available(
  theme: ReportTheme,
  variant: ReportVariantDocument,
): Extract<ReportVariantResolution, { kind: 'available' }> {
  return {
    kind: 'available',
    theme,
    fileRef: variant.fileRef,
    pdfDigest: variant.pdfDigest,
    ...(variant.pageCount === undefined ? {} : { pageCount: variant.pageCount }),
  };
}

/** Resolve exactly the requested stored presentation. This helper is shared
 * by delivery, dashboard, and approval code so a light request can never
 * silently read the canonical dark bytes. */
export function resolveReportVariant(
  report: ReportVariantSource,
  theme: ReportTheme,
): ReportVariantResolution {
  if (theme === 'dark') {
    if (!report.fileRef || !report.pdfDigest) {
      return { kind: 'unavailable', theme, reason: 'dark-artifact-unavailable' };
    }
    return available('dark', {
      fileRef: report.fileRef,
      pdfDigest: report.pdfDigest,
      ...(report.pageCount === undefined ? {} : { pageCount: report.pageCount }),
    });
  }

  const light = report.variants?.light;
  return light === undefined
    ? { kind: 'unavailable', theme, reason: 'light-variant-unavailable' }
    : available('light', light);
}
