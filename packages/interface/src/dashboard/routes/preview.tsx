import type { JSX } from 'react';
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
import { formatDateTime } from '../lib/format';
import { previewState, useInsightView } from './insights-model';
import type { PreviewResponse, PreviewState } from './insights-model';

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
        {/* The operator inspects the same published document the prospect is
            served: it left this codebase through the shared safe renderer at
            publication time. The public link itself is a bearer URL built
            from a raw token that was never stored, so there is deliberately
            no open-public affordance here, only the metadata above. */}
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-ink-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {strings.preview.rendererNote}
        </p>
      </Card>
    );
  }

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        title={strings.preview.title}
        description={strings.preview.description}
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
