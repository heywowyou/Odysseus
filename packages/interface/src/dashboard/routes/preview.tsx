import type { JSX } from 'react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Info } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { postEmpty } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { candidateCityLabel, previewState, useInsightView } from './insights-model';
import type { PreviewRevokeResponse, PreviewResponse, PreviewState } from './insights-model';

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
  const { data, error, refresh, isNotFound } = useInsightView<PreviewResponse>(path);

  // Plan 037: the prescan-backed v1 preview is retired. Publication and
  // re-issue moved to the audit page's v2 outreach card; this page keeps
  // the stored row's status display and its revoke action, because a
  // legacy v1 row stays revocable until it expires.
  const [isBusy, setIsBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);

  async function runRevoke(): Promise<void> {
    if (candidateId === undefined || isBusy) return;
    setIsBusy(true);
    setActionFailed(false);
    try {
      await postEmpty<PreviewRevokeResponse>(
        `/api/prospects/${encodeURIComponent(candidateId)}/preview/revoke`,
      );
      refresh();
    } catch {
      setActionFailed(true);
    } finally {
      setIsBusy(false);
    }
  }

  const state: PreviewState = data === undefined ? 'none' : previewState(data, Date.now());

  const currentActions =
    candidateId === undefined ? null : (
      <div className="flex flex-wrap items-center gap-2">
        {state === 'live' ? (
          <Button
            variant="danger"
            size="sm"
            isLoading={isBusy}
            disabled={isBusy}
            onClick={() => {
              setIsRevokeOpen(true);
            }}
          >
            {strings.preview.revokeAction}
          </Button>
        ) : null}
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
          {strings.preview.retiredNote}
        </p>
        <p className="mt-2 flex items-start gap-2 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {strings.preview.rendererNote}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          {currentActions}
        </div>
        {actionFailed ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {strings.preview.actionError}
          </p>
        ) : null}
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
      <ConfirmDialog
        open={isRevokeOpen}
        onOpenChange={setIsRevokeOpen}
        title={strings.preview.revokeConfirmTitle}
        description={strings.preview.revokeConfirmBody}
        confirmLabel={strings.preview.revokeAction}
        cancelLabel={strings.common.cancel}
        onConfirm={runRevoke}
      />
    </article>
  );
}
