/**
 * The audit page's stored-reports list (plan 040 slice 5, the failure card
 * moved out to failure-card.tsx by plan 045 stage 3.4). The list renders
 * inside the report panel's production section, whose button is the only
 * way to regenerate the PDFs.
 */

import { useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { buttonStyles } from '../components/ui/button';
import { useI18n } from '../i18n/provider';
import { postEmpty } from '../lib/api';
import { fallbackNoticeText, hasPageCountWarning } from './audit-detail-model';
import type { AuditDetailResponse, ReportFreshness, ReportLanguage } from './audit-detail-types';

/** Issue #91: the report endpoints answer conflicts with a JSON body the
 *  browser would render as a raw page, so the click is handled instead of
 *  navigated: the bytes are fetched first, then handed to the browser as
 *  a blob (new tab for the preview, a download for the file). Any non-OK
 *  answer becomes a thrown Error carrying the server's detail line for
 *  the caller's toast. */
async function openReportPdf(
  url: string,
  mode: 'preview' | 'download',
  fileName: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    const detail =
      body !== null && typeof body === 'object' && 'error' in body
        ? String((body as Record<string, unknown>)['error'])
        : String(response.status);
    throw new Error(detail);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  if (mode === 'preview') {
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  } else {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  // Revoke late: a preview tab the operator opens from the notification
  // may still be loading; a leaked URL for a minute is the smaller harm.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

const FRESHNESS_TONES: Record<ReportFreshness, BadgeTone> = {
  fresh: 'minor',
  stale: 'serious',
  unverified: 'neutral',
};

export function ReportsCard(props: {
  detail: AuditDetailResponse;
  /** Plan 045 section 2.3: a download approves the current pair first when
   *  it is not already approved, so this refetches the audit detail
   *  afterwards (the lifecycle badge and the other language's button both
   *  depend on it). */
  onApproved: () => void;
}): JSX.Element {
  const { detail, onApproved } = props;
  const { language, strings } = useI18n();
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const hasReports = detail.reportLanguages.length > 0 && detail.reports.length > 0;
  const reportBase = `/api/audits/${encodeURIComponent(detail.auditId)}/report`;
  // Plan 032 (issue #162): the selected pair came from the audit fallback
  // gate, so the card says why the report has no model-written themes
  // instead of leaving the absence to be read as a failure.
  const staticFallbackNotice = fallbackNoticeText(detail.analysisIsStaticFallback, language);

  const openReport = async (
    language: ReportLanguage,
    mode: 'preview' | 'download',
  ): Promise<void> => {
    setIsLoadingReport(true);
    try {
      // One-click approve & download (plan 045 section 2.3, trade-off 44
      // unchanged): approval still gates the actual download, but the
      // operator no longer has to find the separate approve step first -
      // clicking download approves both languages when needed.
      if (mode === 'download' && detail.lifecycle !== 'approved') {
        await postEmpty(`/api/audits/${encodeURIComponent(detail.auditId)}/approve-reports`);
        onApproved();
      }
      await openReportPdf(
        mode === 'preview' ? `${reportBase}/${language}/preview` : `${reportBase}/${language}`,
        mode,
        `odysseus-rapport-${language}.pdf`,
      );
    } catch (error) {
      toast.error(strings.auditDetail.reportUnavailableError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  return (
    <Card title={strings.auditDetail.reportsHeading}>
      {staticFallbackNotice !== undefined ? (
        <p className="mb-3 max-w-reading text-xs text-ink-muted">{staticFallbackNotice}</p>
      ) : null}
      {!hasReports ? (
        <p className="text-sm text-ink-muted">{strings.auditDetail.noReportsYet}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {detail.reports.map((report) => (
            <li key={report.language} className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-sm font-medium text-ink">
                {strings.auditDetail.languageLabels[report.language]}
              </span>
              {report.pdfAvailable ? (
                <>
                  <Badge tone={FRESHNESS_TONES[report.status]}>
                    {strings.auditDetail.reportFreshness[report.status]}
                  </Badge>
                  {/* Non-blocking length warning (plan 018): the report stays
                      previewable and deliverable, the row only grows a badge. */}
                  {hasPageCountWarning(report.pageCount) ? (
                    <Badge tone="moderate">
                      {strings.auditDetail.reportPageCountWarning.replace(
                        '{count}',
                        String(report.pageCount),
                      )}
                    </Badge>
                  ) : null}
                  <a
                    className={buttonStyles('ghost', 'sm')}
                    href={`${reportBase}/${report.language}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={isLoadingReport}
                    onClick={(event) => {
                      event.preventDefault();
                      void openReport(report.language, 'preview');
                    }}
                  >
                    {strings.auditDetail.previewReport}
                  </a>
                  <a
                    className={buttonStyles('ghost', 'sm')}
                    href={`${reportBase}/${report.language}`}
                    download
                    aria-disabled={isLoadingReport}
                    onClick={(event) => {
                      event.preventDefault();
                      void openReport(report.language, 'download');
                    }}
                  >
                    {detail.lifecycle === 'approved'
                      ? strings.auditDetail.approvedDownload
                      : strings.auditDetail.approveAndDownload}
                  </a>
                </>
              ) : (
                <>
                  {/* Issue #91: a freshness badge asserts an availability the
                      endpoints cannot honour from this machine, so an
                      unreachable report reads as its own state instead. The
                      row keeps no regenerate button of its own: the step's
                      single button above owns that action. */}
                  <Badge tone={report.status === 'unverified' ? 'neutral' : 'serious'}>
                    {report.status === 'unverified'
                      ? strings.auditDetail.reportFreshness.unverified
                      : strings.auditDetail.reportPdfUnavailableBadge}
                  </Badge>
                  <p className="w-full text-xs text-ink-muted">
                    {report.status === 'unverified'
                      ? strings.auditDetail.reportPdfMissingNote
                      : strings.auditDetail.reportPdfUnavailableNote}
                  </p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
