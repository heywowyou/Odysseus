import type { JSX } from 'react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Info } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { CopyButton } from '../components/ui/copy-button';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { fetchJson, postEmpty, sendJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { candidateCityLabel, previewState, useInsightView } from './insights-model';
import type {
  PreviewPublishResponse,
  PreviewRevokeResponse,
  PreviewRenderResponse,
  PreviewResponse,
  PreviewState,
} from './insights-model';

const STATE_TONES: Record<PreviewState, BadgeTone> = {
  live: 'accent',
  revoked: 'critical',
  expired: 'serious',
  none: 'neutral',
};

type PreviewAction = 'publish' | 'reissue' | 'revoke';

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

  // Issue #97: the three publication actions. Re-issue is the same publish
  // endpoint called when a preview already exists; only the copy differs.
  const [pendingAction, setPendingAction] = useState<PreviewAction | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionRefused, setActionRefused] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  /** The one-time bearer link of a successful publish. Held only in this
   *  component's memory for the single display, never stored anywhere. */
  const [publishedLink, setPublishedLink] = useState<string | null>(null);

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

  async function runAction(action: PreviewAction): Promise<void> {
    if (candidateId === undefined || isBusy) return;
    setIsBusy(true);
    setActionRefused(false);
    setActionFailed(false);
    try {
      if (action === 'revoke') {
        await postEmpty<PreviewRevokeResponse>(
          `/api/prospects/${encodeURIComponent(candidateId)}/preview/revoke`,
        );
      } else {
        const result = await sendJson<PreviewPublishResponse>(
          `/api/prospects/${encodeURIComponent(candidateId)}/preview/publish`,
          'POST',
          {},
        );
        if (result.published) {
          setPublishedLink(result.url);
        } else {
          setActionRefused(true);
        }
      }
      refresh();
    } catch {
      setActionFailed(true);
    } finally {
      setIsBusy(false);
    }
  }

  function actionButton(action: PreviewAction): JSX.Element {
    const label =
      action === 'publish'
        ? strings.preview.publishAction
        : action === 'reissue'
          ? strings.preview.reissueAction
          : strings.preview.revokeAction;
    return (
      <Button
        variant={action === 'revoke' ? 'danger' : action === 'publish' ? 'primary' : 'secondary'}
        size="sm"
        isLoading={isBusy && pendingAction === action}
        disabled={isBusy}
        onClick={() => {
          setPendingAction(action);
        }}
      >
        {label}
      </Button>
    );
  }

  const state: PreviewState = data === undefined ? 'none' : previewState(data, Date.now());

  const currentActions =
    candidateId === undefined ? null : (
      <div className="flex flex-wrap items-center gap-2">
        {actionButton(state === 'none' ? 'publish' : 'reissue')}
        {state === 'live' ? actionButton('revoke') : null}
      </div>
    );

  let body: JSX.Element;
  if (isNotFound) {
    body = (
      <div className="flex flex-col gap-4">
        <EmptyState title={strings.preview.empty} />
        {currentActions}
      </div>
    );
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
    body = (
      <>
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
              <dd className="mt-1 text-sm text-ink">
                {formatDateTime(data.publishedAt, language)}
              </dd>
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            {currentActions}
            <Button variant="secondary" size="sm" onClick={toggleCurrentPreview}>
              {isCurrentPreviewOpen
                ? strings.preview.hideCurrentPreview
                : strings.preview.showCurrentPreview}
            </Button>
          </div>
          {actionRefused ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {strings.preview.actionRefused}
            </p>
          ) : null}
          {actionFailed ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {strings.preview.actionError}
            </p>
          ) : null}
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
        </Card>
      </>
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
      {publishedLink !== null ? (
        <Card className="mb-4">
          <h2 className="text-sm font-semibold text-ink">{strings.preview.linkOnceTitle}</h2>
          <p className="mt-1 text-sm text-ink-soft" role="note">
            {strings.preview.linkOnceWarning}
          </p>
          <p className="mt-3 break-all rounded-lg border border-line bg-raised p-3 font-mono text-xs text-ink">
            {publishedLink}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton
              text={publishedLink}
              label={strings.preview.linkCopy}
              copiedLabel={strings.preview.linkCopied}
            />
            <Button size="sm" onClick={() => setPublishedLink(null)}>
              {strings.preview.linkConfirmButton}
            </Button>
          </div>
        </Card>
      ) : null}
      {body}
      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={
          pendingAction === 'revoke'
            ? strings.preview.revokeConfirmTitle
            : pendingAction === 'reissue'
              ? strings.preview.reissueConfirmTitle
              : strings.preview.publishConfirmTitle
        }
        description={
          pendingAction === 'revoke'
            ? strings.preview.revokeConfirmBody
            : pendingAction === 'reissue'
              ? strings.preview.reissueConfirmBody
              : strings.preview.publishConfirmBody
        }
        confirmLabel={
          pendingAction === 'revoke'
            ? strings.preview.revokeAction
            : pendingAction === 'reissue'
              ? strings.preview.reissueAction
              : strings.preview.publishAction
        }
        cancelLabel={strings.common.cancel}
        onConfirm={() => runAction(pendingAction ?? 'publish')}
      />
    </article>
  );
}
