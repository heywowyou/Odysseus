/**
 * The audit page's preview note (plan 040 slice 5): publication, takedown,
 * and the first-draft action moved to the hotel hub in slice 4, so an
 * audit linked to a prospect only points there. An audit with no prospect
 * keeps the two read-only preview actions, the scorecard view and the
 * operator PDF, ported from the retired plan 037 outreach card.
 */

import { useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { fetchJson, fetchWithTimeout } from '../lib/api';
import { outreachRefusalSentence } from './audit-detail-model';
import type { OutreachPreviewRenderResponse } from './audit-detail-model';

/** Outcome of fetching the operator PDF. The endpoint answers a readiness
 *  refusal with 200 JSON, so the content type is inspected before the
 *  bytes reach the browser: a refusal must become a sentence on the page,
 *  never a corrupt downloaded file. */
type OutreachPdfFetch =
  { kind: 'pdf'; blob: Blob } | { kind: 'refused'; refusal: string } | { kind: 'failed' };

async function fetchOutreachPreviewPdf(url: string): Promise<OutreachPdfFetch> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url);
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

/** Same download dance as the reports card: the bytes are fetched first,
 *  then handed to the browser as a blob, so a failed fetch can never
 *  navigate the operator to a raw JSON page. */
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

/** The read-only preview card of an audit with no prospect: the on-demand
 *  scorecard (the same HTML a published link serves) and the operator
 *  PDF, nothing to publish and nothing to take down. */
function ReadOnlyPreviewCard(props: { auditId: string }): JSX.Element {
  const { auditId } = props;
  const { language, strings } = useI18n();
  const copy = strings.auditDetail.outreachPreview;
  const base = `/api/audits/${encodeURIComponent(auditId)}/outreach-preview`;

  // Scorecard disclosure: fetched when first opened, exactly like the
  // hub's Apercu section.
  const [isScorecardOpen, setIsScorecardOpen] = useState(false);
  const [scorecardHtml, setScorecardHtml] = useState<string>();
  const [scorecardNotice, setScorecardNotice] = useState<string | null>(null);
  const [isLoadingScorecard, setIsLoadingScorecard] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const loadScorecard = async (): Promise<void> => {
    if (isLoadingScorecard) return;
    setIsLoadingScorecard(true);
    setScorecardNotice(null);
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
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setPdfNotice(null);
    try {
      const outcome = await fetchOutreachPreviewPdf(`${base}/pdf`);
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

  return (
    <Card title={copy.title} description={copy.description}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={isScorecardOpen}
          onClick={toggleScorecard}
        >
          {isScorecardOpen ? copy.hideScorecard : copy.viewScorecard}
        </Button>
        {isScorecardOpen && scorecardHtml !== undefined ? (
          <Button
            variant="secondary"
            size="sm"
            isLoading={isLoadingScorecard}
            disabled={isLoadingScorecard}
            onClick={() => void loadScorecard()}
          >
            {copy.regenerateScorecard}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          isLoading={isDownloadingPdf}
          disabled={isDownloadingPdf}
          onClick={() => void downloadPdf()}
        >
          {copy.downloadPdf}
        </Button>
      </div>
      {pdfNotice !== null ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {pdfNotice}
        </p>
      ) : null}
      {isScorecardOpen ? (
        <div className="mt-3">
          {isLoadingScorecard ? (
            <Skeleton className="h-[48rem] w-full" />
          ) : scorecardNotice !== null ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised p-3">
              <p className="text-sm text-ink-soft">{scorecardNotice}</p>
              <Button variant="secondary" size="sm" onClick={() => void loadScorecard()}>
                {strings.common.retry}
              </Button>
            </div>
          ) : scorecardHtml !== undefined ? (
            <iframe
              title={copy.title}
              className="h-[48rem] w-full rounded-lg border border-line bg-white"
              sandbox=""
              srcDoc={scorecardHtml}
            />
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function AuditPreviewNote(props: {
  auditId: string;
  candidateId: string | null;
}): JSX.Element {
  const { auditId, candidateId } = props;
  const { strings } = useI18n();
  if (candidateId !== null) {
    // The IA's one line: the preview of a prospect-linked audit is
    // published, reissued, and revoked from the hotel hub, so the audit
    // page only shows the way there.
    return (
      <p className="text-sm text-ink-soft">
        <Link
          to={`/prospects/${encodeURIComponent(candidateId)}#hub-preview`}
          className="underline transition-colors hover:text-ink"
        >
          {strings.auditDetail.previewManagedFromProspect}
        </Link>
      </p>
    );
  }
  return <ReadOnlyPreviewCard auditId={auditId} />;
}
