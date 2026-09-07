import type { JSX } from 'react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Info } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { fetchJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { candidateCityLabel, previewState, useInsightView } from './insights-model';
import type { PreviewRenderResponse, PreviewResponse, PreviewState } from './insights-model';

const STATE_TONES: Record<PreviewState, BadgeTone> = {
  live: 'accent',
  revoked: 'critical',
  expired: 'serious',
  none: 'neutral',
};

export function PreviewPage(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { strings, language } = useI18n();
  const path =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}/preview`;
  const renderPath =
    candidateId === undefined
      ? null
      : `/api/prospects/${encodeURIComponent(candidateId)}/outreach/preview-render`;
  const { data, error, refresh, isNotFound } = useInsightView<PreviewResponse>(path);
  const [isCurrentPreviewOpen, setIsCurrentPreviewOpen] = useState(false);
  const [currentPreviewHtml, setCurrentPreviewHtml] = useState<string>();
  const [currentPreviewError, setCurrentPreviewError] = useState<'unavailable' | 'failed'>();
  const [isCurrentPreviewLoading, setIsCurrentPreviewLoading] = useState(false);

  async function loadCurrentPreview(): Promise<void> {
    if (renderPath === null || isCurrentPreviewLoading) return;
    setIsCurrentPreviewLoading(true);
    setCurrentPreviewError(undefined);
    try {
      const result = await fetchJson<PreviewRenderResponse>(renderPath);
      if (result.rendered) {
        setCurrentPreviewHtml(result.html);
      } else {
        setCurrentPreviewError('unavailable');
      }
    } catch {
      setCurrentPreviewError('failed');
    } finally {
      setIsCurrentPreviewLoading(false);
    }
  }

  function toggleCurrentPreview(): void {
    const opening = !isCurrentPreviewOpen;
    setIsCurrentPreviewOpen(opening);
    if (opening && currentPreviewHtml === undefined && currentPreviewError === undefined) {
      void loadCurrentPreview();
    }
  }

  let body: JSX.Element;
  if (isNotFound) {
    body = <EmptyState title={strings.preview.empty} />;
  } else if (error !== undefined && data === undefined) {
    body = (
      <EmptyState
        title={strings.common.requestFailed}
        description={error}
        action={
          <Button variant="secondary" onClick={refresh}>
            {strings.common.retry}
          </Button>
        }
      />
    );
  } else if (data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  } else {
    const state = previewState(data, Date.now());
    body = (
      <Card>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-muted">{strings.preview.statusLabel}</dt>
            <dd className="mt-1">
              <Badge tone={STATE_TONES[state]}>{strings.preview.states[state]}</Badge>
            </dd>
            {data.revokedReason !== null ? (
              <p className="mt-1 text-xs text-ink-muted">{data.revokedReason}</p>
            ) : null}
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{strings.preview.publishedLabel}</dt>
            <dd className="mt-1 text-sm text-ink">{formatDateTime(data.publishedAt, language)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">{strings.preview.expiresLabel}</dt>
            <dd className="mt-1 text-sm text-ink">
              {formatDateTime(data.publicExpiresAt, language)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {strings.preview.rendererNote}
        </p>
        <div className="mt-4 border-t border-line pt-4">
          <Button variant="secondary" size="sm" onClick={toggleCurrentPreview}>
            {isCurrentPreviewOpen
              ? strings.preview.hideCurrentPreview
              : strings.preview.showCurrentPreview}
          </Button>
          {isCurrentPreviewOpen ? (
            <div className="mt-3">
              <p className="flex items-start gap-2 text-xs text-ink-muted">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {strings.preview.currentPreviewNote}
              </p>
              {isCurrentPreviewLoading ? (
                <Skeleton className="mt-3 h-[48rem] w-full" />
              ) : currentPreviewHtml !== undefined ? (
                <iframe
                  title={strings.preview.showCurrentPreview}
                  className="mt-3 h-[48rem] w-full rounded-lg border border-line bg-white"
                  sandbox=""
                  srcDoc={currentPreviewHtml}
                />
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-raised p-3">
                  <p className="text-sm text-ink-soft">
                    {currentPreviewError === 'unavailable'
                      ? strings.preview.currentPreviewUnavailable
                      : strings.preview.currentPreviewError}
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => void loadCurrentPreview()}>
                    {strings.common.retry}
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        eyebrow={strings.preview.title}
        title={data?.name ?? strings.preview.title}
        subject={data === undefined ? undefined : candidateCityLabel(data)}
        description={strings.preview.description}
        meta={
          data === undefined ? null : <p className="ident text-xs text-ink-muted">{candidateId}</p>
        }
        actions={
          candidateId !== undefined ? (
            <Link
              to={`/prospects/${encodeURIComponent(candidateId)}`}
              className={buttonStyles('secondary', 'sm')}
            >
              {strings.operator.backToProspects}
            </Link>
          ) : null
        }
      />
      {body}
    </article>
  );
}
