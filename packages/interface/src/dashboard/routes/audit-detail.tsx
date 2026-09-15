/**
 * The audit detail page (plan 040 slice 5 restructure): a read-only header
 * (breadcrumb, date, pages, severity bar, report stage; no action
 * buttons), then Constats first because the findings are what the audit
 * is, then the client-report stepper that owns every write action, then
 * the preview note. The page polls every five seconds only while the
 * stepper reports a write in flight; otherwise it fetches once and again
 * after each action.
 */

import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';
import { cn } from '../lib/cn';
import { ApiError, fetchJsonValidated } from '../lib/api';
import { auditDetailSchema } from '../lib/api-schemas';
import { formatDateTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import { AuditGradeOverridePanel } from './audit-grade-override-panel';
import { AuditProspectLinkPanel } from './audit-hotel-link-panel';
import { AuditPreviewNote } from './audit-preview-note';
import { AuditReportPanel } from './audit-report-panel';
import {
  findPublisherIdentificationFinding,
  hostnameOf,
  isReportStageFailure,
  SEVERITIES,
} from './audit-detail-model';
import { FailureCard } from './audit-reports-section';
import { FindingsCard, PublisherIdentificationAlert } from './audit-findings-section';
import type { AuditDetailResponse, Severity, SeverityRollup } from './audit-detail-types';

interface AuditDetailState {
  data: AuditDetailResponse | undefined;
  error: string | undefined;
  isLoading: boolean;
  refresh: () => void;
  isNotFound: boolean;
}

/** useApi-flavoured fetch of the audit detail with one addition: the
 *  polling layer flattens every failure to a message string and drops
 *  ApiError.status, so the fetcher records a 404 itself and the page can
 *  render the dedicated not-found state instead of a generic error. The
 *  interval is a prop: the page passes 5000 only while one of its own
 *  writes is in flight. */
function useAuditDetail(auditId: string | undefined, intervalMs: number): AuditDetailState {
  const path = auditId === undefined ? null : `/api/audits/${encodeURIComponent(auditId)}`;
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    setIsNotFound(false);
  }, [auditId]);

  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<AuditDetailResponse> => {
      try {
        const validated = await fetchJsonValidated(path ?? '', auditDetailSchema, { signal });
        return validated as unknown as AuditDetailResponse;
      } catch (cause: unknown) {
        if (cause instanceof ApiError && cause.status === 404) {
          setIsNotFound(true);
        }
        throw cause;
      }
    },
    [path],
  );

  const polling = usePolling<AuditDetailResponse>(fetcher, intervalMs, {
    enabled: path !== null,
    key: path ?? 'none',
  });
  return { ...polling, isNotFound };
}

/** The severity rollup drawn to scale rather than as four equal tiles.
 *  Four same-sized numbers make a hundred minor issues look like the four
 *  critical ones; the whole point of the mix is its proportion. Every count
 *  is still written out beside its swatch, so nothing depends on the bar. */
function SeverityBar(props: { rollup: SeverityRollup; strings: DashboardStrings }): JSX.Element {
  const { rollup, strings } = props;
  const total = SEVERITIES.reduce((sum, severity) => sum + rollup[severity], 0);
  return (
    <figure className="m-0">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
        {SEVERITIES.map((severity) =>
          rollup[severity] === 0 ? null : (
            <div
              key={severity}
              className={SEVERITY_FILL[severity]}
              style={{ width: `${(rollup[severity] / total) * 100}%` }}
            />
          ),
        )}
      </div>
      <figcaption className="mt-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {SEVERITIES.map((severity) => (
            <div key={severity} className="flex items-baseline gap-2">
              <span
                className={cn('size-2 shrink-0 rounded-sm', SEVERITY_FILL[severity])}
                aria-hidden="true"
              />
              <dt className="text-xs text-ink-muted">{strings.common.severityLabels[severity]}</dt>
              <dd className="numeric text-sm font-medium text-ink">{rollup[severity]}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}

const SEVERITY_FILL: Record<Severity, string> = {
  critical: 'bg-sev-critical',
  serious: 'bg-sev-serious',
  moderate: 'bg-sev-moderate',
  minor: 'bg-sev-minor',
};

export function AuditDetailPage(): JSX.Element {
  const { auditId } = useParams<{ auditId: string }>();
  const { language, strings } = useI18n();
  // Plan 040 poll policy: a detail page polls every 5s only while
  // something it started is in flight (a writing or a PDF regeneration on
  // the stepper); otherwise it fetches once, and again after each action.
  const [isBusy, setIsBusy] = useState(false);
  const { data, error, refresh, isNotFound } = useAuditDetail(auditId, isBusy ? 5_000 : 0);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

  // Navigating between audits unmounts the stepper without its finally
  // blocks necessarily having run; the new audit must not inherit a busy
  // flag it never set.
  useEffect(() => {
    setIsBusy(false);
  }, [auditId]);

  if (isNotFound) {
    return (
      <article className={PAGE_WIDTH.surface}>
        <EmptyState title={strings.auditDetail.notFound} />
      </article>
    );
  }

  if (error !== undefined && data === undefined) {
    return (
      <article>
        <EmptyState
          title={strings.common.requestFailed}
          description={error}
          action={
            <Button variant="secondary" onClick={refresh}>
              {strings.common.retry}
            </Button>
          }
        />
      </article>
    );
  }

  if (data === undefined) {
    return (
      <article aria-busy="true" aria-label={strings.common.loading}>
        <div className="mb-8">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-36" />
          <Skeleton className="h-80" />
          <Skeleton className="h-72" />
        </div>
      </article>
    );
  }

  const publisherIdentificationFinding = findPublisherIdentificationFinding(data.findings);
  const prospect = data.prospect ?? null;

  return (
    <article className={PAGE_WIDTH.surface}>
      <PageHeader
        eyebrow={strings.common.typeLabels.fullAudit}
        // An attached audit links back to the durable prospect; an
        // unattached audit keeps its hostname as the stable subject.
        title={
          data.prospectId !== undefined ? (
            <Link to={`/prospects/${data.prospectId}`} className="transition-colors hover:text-ink">
              {prospect?.name ?? hostnameOf(data.siteUrl)}
            </Link>
          ) : (
            hostnameOf(data.siteUrl)
          )
        }
        subject={prospect !== null ? hostnameOf(data.siteUrl) : undefined}
        meta={
          <div className="flex flex-col gap-4">
            <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
              <div className="flex items-baseline gap-2">
                <dt className="text-ink-muted">{strings.auditDetail.dateLabel}</dt>
                <dd className="numeric text-ink">{formatDateTime(data.startedAt, language)}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-ink-muted">{strings.auditDetail.pagesVisitedLabel}</dt>
                <dd className="numeric text-ink">{data.pagesVisited}</dd>
              </div>
            </dl>
            <SeverityBar rollup={data.severityRollup} strings={strings} />
            <AuditProspectLinkPanel
              auditId={data.auditId}
              prospect={prospect}
              canAttachProspect={data.canAttachProspect ?? false}
              onChanged={refresh}
            />
          </div>
        }
        // The report stage is the header's only action-shaped element:
        // every write lives on the stepper below, one button per step.
        actions={
          <Badge>
            {strings.auditDetail.lifecycleLabel} : {strings.auditDetail.lifecycle[data.lifecycle]}
          </Badge>
        }
      />
      <div className="flex flex-col gap-6">
        {isReportStageFailure({ failure: data.failure, lifecycle: data.lifecycle }) &&
        data.failure !== undefined ? (
          <FailureCard failure={data.failure} lifecycle={data.lifecycle} />
        ) : null}
        {/* Constats first (approved IA): the findings are what the audit
            is; the client report is built from them below. */}
        {publisherIdentificationFinding !== undefined ? (
          <PublisherIdentificationAlert
            finding={publisherIdentificationFinding}
            onRevealFinding={() => setExpandedFindingId(publisherIdentificationFinding.findingId)}
          />
        ) : null}
        <FindingsCard
          findings={data.findings}
          ruleCopy={data.ruleCopy}
          language={language}
          expandedFindingId={expandedFindingId}
          onExpandedFindingChange={setExpandedFindingId}
        />
        {/* Plan 042 slice 3: the panel stays always visible here, even
            though the hub shows it only once the hotel is sold. A
            standalone audit (started from /scans/new, or a paying client
            who was never a prospect) has no outcome to read, so hiding
            the paid chain behind "sold" on this page would make it
            unreachable for exactly the clients it exists for. */}
        <AuditReportPanel
          auditId={data.auditId}
          detail={data}
          onBusy={setIsBusy}
          refresh={refresh}
        />
        <AuditGradeOverridePanel
          auditId={data.auditId}
          detail={data}
          onBusy={setIsBusy}
          refresh={refresh}
        />
        <AuditPreviewNote auditId={data.auditId} prospectId={data.outreach?.prospectId ?? null} />
      </div>
    </article>
  );
}
