import { useState } from 'react';
import type { JSX } from 'react';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { CopyButton } from '../components/ui/copy-button';
import { useI18n } from '../i18n/provider';
import { fetchJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { previewState } from './insights-model';
import type { PreviewResponse, PreviewState } from './insights-model';
import { outreachRefusalSentence, type OutreachPreviewRenderResponse } from './audit-detail-model';

const STATE_TONES: Record<PreviewState, BadgeTone> = {
  live: 'accent',
  revoked: 'critical',
  expired: 'serious',
  none: 'neutral',
};

/** Outcome of fetching the operator PDF. The endpoint answers a readiness
 *  refusal with 200 JSON, so the content type is inspected before the
 *  bytes reach the browser: a refusal must become a sentence on the page,
 *  never a corrupt downloaded file. Same dance as the audit page's card. */
type OutreachPdfFetch =
  { kind: 'pdf'; blob: Blob } | { kind: 'refused'; refusal: string } | { kind: 'failed' };

async function fetchOutreachPreviewPdf(url: string): Promise<OutreachPdfFetch> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { kind: 'failed' };
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || contentType.includes('application/json')) {
    const body: unknown = await response.json().catch(() => ({}));
    if (body !== null && typeof body === 'object' && 'refusal' in body) {
      return { kind: 'refused', refusal: String((body as Record<string, unknown>)['refusal']) };
    }
    return { kind: 'failed' };
  }
  try {
    return { kind: 'pdf', blob: await response.blob() };
  } catch {
    return { kind: 'failed' };
  }
}

function savePdfFile(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke late: the download may still be starting when this returns.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** The hub's fourth section: the preview's status, publication and expiry
 *  dates, the scorecard view, the operator PDF, publish or reissue,
 *  revocation, and the once-only published link (approved IA, section 4).
 *  Plan 045 section 1.7: first-email drafting publishes its own preview
 *  server-side and never routes a token through this page; a link shown
 *  here can come from a manual publish made on this tab, or from a
 *  first-email call reporting back the fresh link it just made. */
export function HubPreviewSection(props: {
  auditId: string | null;
  preview: PreviewResponse | null;
  /** The once-only bearer link of a publish made on this visit, if any. */
  publishedLink: string | null;
  /** Whether a touch-1 draft already carries the current live link: if so,
   *  reissuing invalidates a link an email draft already embeds and needs
   *  confirmation. Otherwise nobody holds the link yet and publishing (or
   *  reissuing) is a plain action, plan 045 section 2.4. */
  hasTouch1Draft: boolean;
  isBusy: boolean;
  onPublish: () => Promise<void>;
  onRevoke: () => Promise<void>;
}): JSX.Element {
  const { auditId, preview, publishedLink, hasTouch1Draft, isBusy, onPublish, onRevoke } = props;
  const { strings, language } = useI18n();
  const copy = strings.auditDetail.outreachPreview;

  const [isReissueOpen, setIsReissueOpen] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  // Scorecard disclosure: fetched when first opened, like the audit card's.
  const [isScorecardOpen, setIsScorecardOpen] = useState(false);
  const [scorecardHtml, setScorecardHtml] = useState<string>();
  const [scorecardNotice, setScorecardNotice] = useState<string | null>(null);
  const [isLoadingScorecard, setIsLoadingScorecard] = useState(false);

  const state: PreviewState = preview === null ? 'none' : previewState(preview, Date.now());

  const loadScorecard = async (): Promise<void> => {
    if (auditId === null || isLoadingScorecard) return;
    setIsLoadingScorecard(true);
    setScorecardNotice(null);
    const base = `/api/audits/${encodeURIComponent(auditId)}/outreach-preview`;
    try {
      const result = await fetchJson<OutreachPreviewRenderResponse>(base);
      if (result.rendered) {
        setScorecardHtml(result.html);
      } else {
        setScorecardNotice(outreachRefusalSentence(result.refusal, language));
      }
    } catch {
      setScorecardNotice(copy.renderError);
    } finally {
      setIsLoadingScorecard(false);
    }
  };

  const toggleScorecard = (): void => {
    const opening = !isScorecardOpen;
    setIsScorecardOpen(opening);
    if (opening && scorecardHtml === undefined && scorecardNotice === null) {
      void loadScorecard();
    }
  };

  const downloadPdf = async (): Promise<void> => {
    if (auditId === null || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setPdfNotice(null);
    try {
      const outcome = await fetchOutreachPreviewPdf(
        `/api/audits/${encodeURIComponent(auditId)}/outreach-preview/pdf`,
      );
      if (outcome.kind === 'pdf') {
        savePdfFile(outcome.blob, `apercu-${auditId}.pdf`);
      } else if (outcome.kind === 'refused') {
        setPdfNotice(outreachRefusalSentence(outcome.refusal, language));
      } else {
        setPdfNotice(copy.actionError);
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const canPublish = auditId !== null && state !== 'live';
  const canRevoke = state === 'live';

  return (
    <Card title={strings.hub.steps.preview} description={strings.preview.description}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-muted">{strings.preview.statusLabel}</dt>
          <dd className="mt-1">
            <Badge tone={STATE_TONES[state]}>{strings.preview.states[state]}</Badge>
          </dd>
          {preview?.revokedReason !== null && preview?.revokedReason !== undefined ? (
            <p className="mt-1 text-xs text-ink-muted">{preview.revokedReason}</p>
          ) : null}
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{strings.preview.publishedLabel}</dt>
          <dd className="mt-1 text-sm text-ink">
            {preview !== null ? formatDateTime(preview.publishedAt, language) : '-'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{strings.preview.expiresLabel}</dt>
          <dd className="mt-1 text-sm text-ink">
            {preview !== null ? formatDateTime(preview.publicExpiresAt, language) : '-'}
          </dd>
        </div>
      </dl>

      {publishedLink !== null ? (
        <div className="mt-4 rounded-lg border border-line bg-raised p-3">
          <p className="text-sm font-medium text-ink">{copy.linkOnceTitle}</p>
          <p className="mt-1 break-all font-mono text-xs text-ink-soft">{publishedLink}</p>
          <div className="mt-2 flex items-center gap-2">
            <CopyButton text={publishedLink} label={copy.linkCopy} copiedLabel={copy.linkCopied} />
          </div>
          <p className="mt-2 text-xs text-ink-muted">{copy.linkOnceWarning}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {canPublish ? (
          <Button
            variant="primary"
            size="sm"
            isLoading={isBusy}
            disabled={isBusy}
            onClick={() => {
              if (state !== 'none' && hasTouch1Draft) {
                setIsReissueOpen(true);
                return;
              }
              void onPublish();
            }}
          >
            {state === 'none' ? copy.publishAction : copy.reissueAction}
          </Button>
        ) : null}
        {canRevoke ? (
          <Button
            variant="danger"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              setIsRevokeOpen(true);
            }}
          >
            {strings.preview.revokeAction}
          </Button>
        ) : null}
        {auditId !== null ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={isScorecardOpen}
              onClick={toggleScorecard}
            >
              {isScorecardOpen ? copy.hideScorecard : copy.viewScorecard}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isLoading={isDownloadingPdf}
              disabled={isDownloadingPdf}
              onClick={() => {
                void downloadPdf();
              }}
            >
              {copy.downloadPdf}
            </Button>
          </>
        ) : null}
      </div>

      {pdfNotice !== null ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {pdfNotice}
        </p>
      ) : null}

      {isScorecardOpen ? (
        <div className="mt-4">
          {isLoadingScorecard ? (
            <p className="text-sm text-ink-muted">{strings.common.loading}</p>
          ) : scorecardNotice !== null ? (
            <p className="text-sm text-ink-soft" role="status">
              {scorecardNotice}
            </p>
          ) : scorecardHtml !== undefined ? (
            <iframe
              srcDoc={scorecardHtml}
              title={copy.viewScorecard}
              className="h-96 w-full rounded-lg border border-line bg-white"
              sandbox=""
            />
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={isReissueOpen}
        onOpenChange={setIsReissueOpen}
        title={strings.preview.reissueConfirmTitle}
        description={strings.preview.reissueConfirmBody}
        confirmLabel={copy.reissueAction}
        cancelLabel={strings.common.cancel}
        onConfirm={onPublish}
      />
      <ConfirmDialog
        open={isRevokeOpen}
        onOpenChange={setIsRevokeOpen}
        title={strings.preview.revokeConfirmTitle}
        description={strings.preview.revokeConfirmBody}
        confirmLabel={strings.preview.revokeAction}
        cancelLabel={strings.common.cancel}
        onConfirm={onRevoke}
      />
    </Card>
  );
}
