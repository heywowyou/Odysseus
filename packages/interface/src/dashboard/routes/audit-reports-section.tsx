/**
 * The report sections of the audit page (plan 040 slice 5): the failure
 * card and the stored-reports list, moved out of audit-detail.tsx when the
 * page was split into composed sections. The failure card no longer
 * regenerates anything: it links to the stepper step to redo, so the page
 * keeps one regenerate affordance per cause. The reports list renders
 * inside the stepper's production step, whose button is the only way to
 * regenerate the PDFs.
 */

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';
import { fetchWithTimeout, postEmpty } from '../lib/api';
import { failureReasonKind, fallbackNoticeText, hasPageCountWarning } from './audit-detail-model';
import { canApproveReportPair } from './audit-report-panel-model';
import type {
  AuditDetailResponse,
  AuditFailureResponse,
  AuditLifecycle,
  ReportFreshness,
  ReportLanguage,
} from './audit-detail-types';

/** Field labels reused from this page's own manual-fields form: the two
 *  identity fields are the same two fields, so the copy cannot drift. */
function failureFieldLabel(field: string, strings: DashboardStrings): string {
  if (field === 'nomCommercial') return strings.auditDetail.nomCommercialLabel;
  if (field === 'raisonSociale') return strings.auditDetail.raisonSocialeLabel;
  return field;
}

// jsdom ships no layout engine, so the scroll targets are resolved lazily
// and the buttons are never clicked in tests without a guard.
function scrollToAnchor(anchor: string): void {
  const target = document.getElementById(anchor);
  if (typeof target?.scrollIntoView === 'function') {
    target.scrollIntoView(true);
  }
}

/** Issue #90: a report-stage failure's reason exists only on the linked job
 *  row until this card surfaces it. Issue #382: only the typed identity case
 *  is an input request; any other failure is shown as a technical failure.
 *  The stored message is the pipeline's own English prescription and is
 *  shown verbatim as a technical detail; the bilingual hint above the
 *  actions carries the remediation, keyed on the typed failure case.
 *  Plan 040 slice 5: the card links to the step to redo instead of
 *  regenerating itself - the identity gate goes to the hotel fields, a
 *  failure after the analysis pair goes back to the PDF production step,
 *  and a `scanned` audit (no pair stored) goes to the writing step, the
 *  only action that creates a pair. */
export function FailureCard(props: {
  failure: AuditFailureResponse;
  lifecycle: AuditLifecycle;
}): JSX.Element {
  const { failure, lifecycle } = props;
  const { strings } = useI18n();
  const isIdentity = failureReasonKind(failure) === 'identity-confirmation';
  const hasPairToRegenerate = lifecycle !== 'scanned';
  const awaitingFields = failure.needsInputFields ?? [];
  return (
    <Card
      title={strings.auditDetail.failureHeading}
      className={isIdentity ? 'border-sev-moderate/40' : 'border-danger/40'}
    >
      {isIdentity && awaitingFields.length > 0 ? (
        <div className="mb-3">
          <p className="text-sm font-medium text-ink">
            {strings.auditDetail.failureAwaitingFieldsLabel}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-soft">
            {awaitingFields.map((entry) => (
              <li key={entry.field}>
                <span className="font-medium text-ink">
                  {failureFieldLabel(entry.field, strings)}:
                </span>{' '}
                {entry.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm text-ink-soft">
        {isIdentity
          ? strings.auditDetail.failureHintIdentity
          : hasPairToRegenerate
            ? strings.auditDetail.failureHintReportStage
            : strings.auditDetail.failureHintAnalysisStage}
      </p>
      {failure.error !== '' ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-muted">
            {strings.auditDetail.failureMessageLabel}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-raised p-3 font-mono text-xs whitespace-pre-wrap text-ink-soft">
            {failure.error}
          </pre>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isIdentity ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToAnchor('audit-hotel-fields')}
          >
            {strings.auditDetail.failureScrollToFields}
          </Button>
        ) : hasPairToRegenerate ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToAnchor('audit-panel-produce')}
          >
            {strings.auditDetail.failureScrollToProduce}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToAnchor('audit-panel-writing')}
          >
            {strings.auditDetail.failureScrollToRedact}
          </Button>
        )}
        <Link
          to={`/scans/${encodeURIComponent(failure.jobId)}`}
          className={buttonStyles('ghost', 'sm')}
        >
          {strings.auditDetail.failureJobLink}
        </Link>
      </div>
    </Card>
  );
}

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
  const response = await fetchWithTimeout(url);
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
  const [qualityBundle, setQualityBundle] = useState<{ bundleId: string; qualityRunId: string; epoch: number; bundleDigest: string; state: string; evidenceApprovalMode: string } | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout(`/api/audits/${encodeURIComponent(detail.auditId)}/report-quality`).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as { candidate?: unknown };
      if (!cancelled && body.candidate && typeof body.candidate === 'object') setQualityBundle(body.candidate as typeof qualityBundle);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [detail.auditId]);
  const hasReports = detail.reportLanguages.length > 0 && detail.reports.length > 0;
  const reportBase = `/api/audits/${encodeURIComponent(detail.auditId)}/report`;
  const isApproved = detail.lifecycle === 'approved';
  const canApprove = isApproved || canApproveReportPair(detail.reports);
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

  const approveQualityBundle = async (): Promise<void> => {
    if (!qualityBundle) return;
    setQualityLoading(true);
    try {
      const response = await fetchWithTimeout(`/api/audits/${encodeURIComponent(detail.auditId)}/report-quality/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ qualityRunId: qualityBundle.qualityRunId, epoch: qualityBundle.epoch, bundleDigest: qualityBundle.bundleDigest }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? String(response.status)); }
      setQualityBundle({ ...qualityBundle, state: 'promoted' });
      onApproved();
    } catch (error) {
      toast.error(language === 'fr' ? "L’approbation du rapport a échoué" : 'Report approval failed', { description: error instanceof Error ? error.message : undefined });
    } finally { setQualityLoading(false); }
  };

  return (
    <Card title={strings.auditDetail.reportsHeading}>
      {qualityBundle ? (
        <div className="mb-4 rounded-lg border border-line bg-raised p-4">
          <p className="text-sm font-medium text-ink">{language === 'fr' ? 'Bundle qualité Plan 058' : 'Plan 058 quality bundle'}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {qualityBundle.state === 'awaiting-operator-approval'
              ? (language === 'fr' ? 'Les contrôles automatiques sont terminés. Prévisualisez les deux PDF exacts avant d’approuver ce bundle.' : 'Automated quality gates are complete. Preview both exact PDFs before approving this bundle.')
              : (language === 'fr' ? `État : ${qualityBundle.state}` : `State: ${qualityBundle.state}`)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['fr','en'] as const).map((reportLanguage) => (
              <a key={reportLanguage} className={buttonStyles('ghost','sm')} href={`/api/audits/${encodeURIComponent(detail.auditId)}/report-quality/${encodeURIComponent(qualityBundle.bundleDigest)}/${reportLanguage}`} target="_blank" rel="noreferrer">
                {language === 'fr' ? `Prévisualiser ${reportLanguage.toUpperCase()}` : `Preview ${reportLanguage.toUpperCase()}`}
              </a>
            ))}
            {qualityBundle.state === 'awaiting-operator-approval' ? (
              <Button size="sm" disabled={qualityLoading || qualityBundle.evidenceApprovalMode === 'legacy-adapter'} onClick={() => void approveQualityBundle()}>
                {language === 'fr' ? 'Approuver ce bundle exact' : 'Approve this exact bundle'}
              </Button>
            ) : null}
          </div>
          {qualityBundle.evidenceApprovalMode === 'legacy-adapter' ? (
            <p className="mt-2 text-xs text-ink-muted">{language === 'fr' ? 'Évaluation uniquement : la promotion client reste bloquée jusqu’à la preuve canonique du Plan 059.' : 'Evaluation only: client promotion remains blocked until Plan 059 canonical evidence exists.'}</p>
          ) : null}
        </div>
      ) : null>
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
                  {report.olderTemplate === true ? (
                    <Badge tone="neutral">{strings.auditDetail.reportOlderTemplate}</Badge>
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
                  {canApprove ? (
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
                      {isApproved
                        ? strings.auditDetail.approvedDownload
                        : strings.auditDetail.approveAndDownload}
                    </a>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled
                        aria-describedby={`approve-unavailable-${report.language}`}
                      >
                        {strings.auditDetail.approveAndDownload}
                      </Button>
                      <p
                        id={`approve-unavailable-${report.language}`}
                        className="w-full text-xs text-ink-muted"
                      >
                        {strings.auditDetail.approveUnavailableReason}
                      </p>
                    </>
                  )}
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
