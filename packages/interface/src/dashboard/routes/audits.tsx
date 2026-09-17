import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ChevronRight, Radar, Square, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Input } from '../components/ui/input';
import type { KpiValueState } from '../components/ui/kpi';
import { cn } from '../lib/cn';
import { Select } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import { StatusDot } from '../components/ui/status-dot';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';
import { fetchJson, postEmpty, sendDelete } from '../lib/api';
import type { ScanSummary } from '../lib/api-types';
import type { DisplayJobStatus } from '../lib/job-outcome';
import { canDelete, canStop } from '../lib/job-actions';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import { currentPhaseLabel } from './scan-progress-model';
import {
  computeKpis,
  filterSummaries,
  listStatus,
  rowTarget,
  scanQueue,
  searchMatches,
  severityBadges,
  siteLabel,
  sortSummaries,
} from './audits-model';
import type {
  AuditsKpis,
  SeverityBadge,
  SeverityKey,
  SortOrder,
  StatusFilter,
} from './audits-model';

// Plan 040 poll policy: lists refresh every 10s (usePolling also pauses
// every poll while the tab is hidden).
const POLL_INTERVAL_MS = 10_000;
const SKELETON_ROW_COUNT = 8;

const STATUS_OPTIONS: readonly DisplayJobStatus[] = [
  'queued',
  'running',
  'complete',
  'report-issue',
  'failed',
  'needs-input',
  'cancelled',
];

/** The one confirm dialog this page can open: at most a single action is
 *  ever pending, so a row button replaces whatever the dialog showed. */
interface PendingScanAction {
  kind: 'stop' | 'delete' | 'remove' | 'clear-queue';
  row?: ScanSummary;
}

function typeBadge(
  summary: ScanSummary,
  strings: DashboardStrings,
): { tone: BadgeTone; label: string } {
  if (summary.type === 'full-audit') {
    return { tone: 'accent', label: strings.common.typeLabels.fullAudit };
  }
  if (summary.type === 'outreach-full-scan' || summary.type === 'prospecting-audit') {
    return { tone: 'accent', label: strings.common.typeLabels.outreachFullScan };
  }
  if (summary.type === 'quick-check') {
    return { tone: 'neutral', label: strings.common.typeLabels.hotelPrescan };
  }
  return { tone: 'neutral', label: strings.common.typeLabels.prospecting };
}

export function AuditsPage(): JSX.Element {
  const { strings, language } = useI18n();
  const navigate = useNavigate();
  // Poll errors keep the last good data on screen, so a blip never blanks a
  // list the operator is reading; the error surfaces as a line instead.
  const { data, error, lastUpdatedAt, refresh } = usePolling(
    (signal) => fetchJson<ScanSummary[]>('/api/scans?limit=200', { signal }),
    POLL_INTERVAL_MS,
    { key: 'audits' },
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [pendingAction, setPendingAction] = useState<PendingScanAction | null>(null);

  const visible = useMemo(
    () =>
      sortSummaries(
        filterSummaries(data ?? [], statusFilter).filter((summary) =>
          searchMatches(summary, search, strings.audits),
        ),
        sortOrder,
      ),
    [data, statusFilter, search, sortOrder, strings.audits],
  );
  const kpis = useMemo(() => computeKpis(data ?? []), [data]);
  // A count is only trustworthy once data exists: while the first load is in
  // flight the tiles show a skeleton, and a failed load shows an explicit
  // unavailable marker, never a zero that would read as "nothing ran".
  const kpiState: KpiValueState =
    data !== undefined ? 'loaded' : error !== undefined ? 'unavailable' : 'loading';
  const queue = useMemo(() => scanQueue(data ?? []), [data]);
  const queuedCount = queue.upNext.length;

  /** One mutation wrapper for stop and delete: the distinction between a 409
   *  (the job just went terminal) and a network blip carries no different
   *  copy, and the refreshed list carries the truth either way. */
  const runRowAction = async (
    row: ScanSummary,
    kind: 'stop' | 'delete' | 'remove',
  ): Promise<void> => {
    try {
      if (kind === 'stop' || kind === 'remove') {
        // Removing a waiting scan is the same cancel as stopping one; only
        // the wording differs, since nothing has started yet.
        await postEmpty(`/api/scans/${encodeURIComponent(row.jobId)}/cancel`);
        toast.success(
          kind === 'remove' ? strings.scanQueue.removedMessage : strings.audits.stoppedMessage,
        );
      } else {
        await sendDelete(`/api/scans/${encodeURIComponent(row.jobId)}`);
        toast.success(strings.audits.deletedMessage);
      }
      // The poll keeps last good data for seconds; refresh shows the new
      // status now.
      refresh();
    } catch {
      toast.error(strings.audits.actionFailed);
    }
  };

  const clearQueue = async (): Promise<void> => {
    try {
      const result = await postEmpty<{ cleared: number }>('/api/scans/queue/clear');
      toast.success(strings.audits.queueClearedMessage.replace('{count}', String(result.cleared)));
      refresh();
    } catch {
      toast.error(strings.audits.actionFailed);
    }
  };

  const pendingRow = pendingAction?.row;
  const pendingSite = pendingRow === undefined ? '' : siteLabel(pendingRow, strings.audits);

  let body: JSX.Element;
  if (data === undefined && error !== undefined) {
    body = (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">{strings.common.requestFailed}</p>
          <p className="text-xs text-ink-muted">{error}</p>
          <Button variant="secondary" onClick={refresh}>
            {strings.common.retry}
          </Button>
        </div>
      </Card>
    );
  } else if (data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  } else if (data.length === 0) {
    body = (
      <EmptyState
        icon={Radar}
        title={strings.audits.emptyState}
        action={
          <Link to="/scans/new" className={buttonStyles('primary')}>
            {strings.audits.emptyStateCta}
          </Link>
        }
      />
    );
  } else {
    body = (
      <>
        {error !== undefined ? (
          <div className="mb-3 text-xs text-ink-muted" role="alert">
            <p>{strings.common.requestFailed}</p>
            <p>{error}</p>
          </div>
        ) : null}
        {visible.length === 0 ? (
          <EmptyState title={strings.audits.emptyFilter} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-48">{strings.audits.dateColumn}</TableHeaderCell>
                  <TableHeaderCell>{strings.audits.siteColumn}</TableHeaderCell>
                  <TableHeaderCell className="w-40">{strings.audits.typeColumn}</TableHeaderCell>
                  <TableHeaderCell className="w-32">{strings.audits.statusColumn}</TableHeaderCell>
                  <TableHeaderCell className="w-56">
                    {strings.audits.severityColumn}
                  </TableHeaderCell>
                  <TableHeaderCell className="w-10">{null}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((summary) => {
                  const target = rowTarget(summary);
                  const site = siteLabel(summary, strings.audits);
                  const badges: SeverityBadge[] = severityBadges(summary.severityRollup);
                  const type = typeBadge(summary, strings);
                  return (
                    <TableRow key={summary.jobId} onClick={() => navigate(target)}>
                      <TableCell className="whitespace-nowrap">
                        <div className="numeric text-ink">
                          {formatDateTime(summary.createdAt, language)}
                        </div>
                        <div className="numeric text-xs text-ink-muted">
                          {formatRelativeTime(summary.createdAt, strings.common.relativeTime)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* The visible link is the keyboard-accessible path to
                            the row target; the row click is the mouse shortcut. */}
                        <Link
                          to={target}
                          className="ident font-medium text-ink hover:text-accent-bright"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {site === '' ? strings.common.unknownSite : site}
                        </Link>
                        {/* Plan 042 slice 4 (approved IA destiny table): the
                            hotel a prospect-linked audit belongs to, named and
                            linked to its hub; the row still opens the audit. */}
                        {summary.prospectId !== undefined ? (
                          <Link
                            to={`/prospects/${encodeURIComponent(summary.prospectId)}`}
                            className="mt-0.5 block text-xs text-ink-soft hover:text-accent-bright"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {strings.nav.prospects}
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge tone={type.tone} className="whitespace-nowrap">
                          {type.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          {/* The displayed status, not the raw one: a failed
                              job whose audit was saved reads as a report issue
                              (issue #386). */}
                          <StatusDot status={listStatus(summary)} />
                          {strings.common.statusLabels[listStatus(summary)]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <SeverityCounts badges={badges} />
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Row mutations stop the row click so pointing at
                            stop or delete never navigates by accident; the
                            chevron stays the row's own navigation affordance. */}
                        <div className="flex items-center justify-end gap-1">
                          {canStop(summary.status) ? (
                            <Button
                              variant="danger"
                              size="sm"
                              className="gap-1.5 px-2"
                              aria-label={strings.audits.stopAction}
                              title={strings.audits.stopAction}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPendingAction({ kind: 'stop', row: summary });
                              }}
                            >
                              <Square className="size-3 fill-current" aria-hidden="true" />
                              <span className="text-xs">{strings.audits.stopAction}</span>
                            </Button>
                          ) : null}
                          {canDelete(summary.status) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2"
                              aria-label={strings.audits.deleteAction}
                              title={strings.audits.deleteAction}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPendingAction({ kind: 'delete', row: summary });
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                          <ChevronRight className="size-4 text-ink-muted" aria-hidden="true" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {lastUpdatedAt !== undefined ? (
          <p className="mt-3 text-right text-xs text-ink-muted">
            {strings.audits.updatedAt.replace(
              '{time}',
              formatDateTime(new Date(lastUpdatedAt), language),
            )}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <article className={PAGE_WIDTH.surface}>
      <PageHeader
        title={strings.audits.title}
        description={strings.audits.description}
        actions={
          <>
            {/* Only worth showing while something is actually waiting: an
                always-on clear button invites clearing a queue that is
                empty. */}
            {queuedCount > 0 ? (
              <Button variant="secondary" onClick={() => setPendingAction({ kind: 'clear-queue' })}>
                {strings.audits.clearQueue}
              </Button>
            ) : null}
            <Link to="/scans/new" className={buttonStyles('primary')}>
              {strings.nav.newScan}
            </Link>
          </>
        }
        meta={
          <QueueReadout
            kpis={kpis}
            state={kpiState}
            unavailableLabel={strings.common.valueUnavailable}
          />
        }
      />

      {data !== undefined && (queue.running.length > 0 || queue.upNext.length > 0) ? (
        <Card
          className="mb-4"
          title={strings.scanQueue.sectionTitle}
          description={strings.scanQueue.sectionDescription}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <section aria-labelledby="scan-queue-running">
              <h3 id="scan-queue-running" className="mb-2 text-xs font-medium text-ink-soft">
                {strings.scanQueue.runningHeading}
              </h3>
              {queue.running.length === 0 ? (
                <p className="text-sm text-ink-muted">{strings.scanQueue.noRunning}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {queue.running.map((row) => (
                    <QueueRow
                      key={row.jobId}
                      row={row}
                      detail={currentPhaseLabel(row.phase, strings.progress.phaseLabels)}
                      actionLabel={strings.audits.stopAction}
                      onAction={() => setPendingAction({ kind: 'stop', row })}
                    />
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="scan-queue-up-next">
              <h3 id="scan-queue-up-next" className="mb-2 text-xs font-medium text-ink-soft">
                {strings.scanQueue.upNextHeading.replace('{count}', String(queue.upNext.length))}
              </h3>
              {queue.upNext.length === 0 ? (
                <p className="text-sm text-ink-muted">{strings.scanQueue.noWaiting}</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {queue.upNext.map((row, index) => (
                    <QueueRow
                      key={row.jobId}
                      row={row}
                      position={index + 1}
                      actionLabel={strings.scanQueue.removeAction}
                      onAction={() => setPendingAction({ kind: 'remove', row })}
                    />
                  ))}
                </ol>
              )}
            </section>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={strings.audits.searchPlaceholder}
            aria-label={strings.audits.searchPlaceholder}
            className="min-w-40 flex-1"
          />
          <div className="w-44">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              aria-label={strings.audits.statusColumn}
            >
              <option value="">{strings.audits.statusFilterAll}</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {strings.common.statusLabels[status]}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as SortOrder)}
              aria-label={strings.audits.sortLabel}
            >
              <option value="newest">{strings.audits.sortNewest}</option>
              <option value="oldest">{strings.audits.sortOldest}</option>
            </Select>
          </div>
        </div>
      </Card>

      {body}

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={
          pendingAction?.kind === 'stop'
            ? strings.audits.confirmStopTitle
            : pendingAction?.kind === 'remove'
              ? strings.scanQueue.confirmRemoveTitle
              : pendingAction?.kind === 'delete'
                ? strings.audits.confirmDeleteTitle
                : strings.audits.confirmClearQueueTitle
        }
        description={
          pendingAction?.kind === 'stop'
            ? strings.audits.confirmStopBody
            : pendingAction?.kind === 'remove'
              ? strings.scanQueue.confirmRemoveBody.replace(
                  '{site}',
                  pendingSite === '' ? strings.common.unknownSite : pendingSite,
                )
              : pendingAction?.kind === 'delete'
                ? strings.audits.confirmDeleteBody.replace(
                    '{site}',
                    pendingSite === '' ? strings.common.unknownSite : pendingSite,
                  )
                : strings.audits.confirmClearQueueBody.replace('{count}', String(queuedCount))
        }
        confirmLabel={
          pendingAction?.kind === 'stop'
            ? strings.audits.stopAction
            : pendingAction?.kind === 'remove'
              ? strings.scanQueue.removeAction
              : pendingAction?.kind === 'delete'
                ? strings.audits.deleteAction
                : strings.audits.clearQueue
        }
        cancelLabel={strings.common.cancel}
        onConfirm={async () => {
          const action = pendingAction;
          if (action === null) return;
          if (action.kind !== 'clear-queue' && action.row !== undefined) {
            await runRowAction(action.row, action.kind);
            return;
          }
          await clearQueue();
        }}
      />
    </article>
  );
}

/** One line of the scan queue: the prospect (or the site when the scan is not
 *  linked to one), the scan type, the phase of a running scan, and its one
 *  action. */
function QueueRow(props: {
  row: ScanSummary;
  position?: number;
  detail?: string;
  actionLabel: string;
  onAction: () => void;
}): JSX.Element {
  const { strings } = useI18n();
  const { row, position, detail, actionLabel, onAction } = props;
  const site = siteLabel(row, strings.audits);
  const type = typeBadge(row, strings);
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          {position !== undefined ? (
            <span className="numeric text-xs text-ink-muted">{position}.</span>
          ) : null}
          <Link
            to={rowTarget(row)}
            className="truncate text-sm font-medium text-ink hover:text-accent-bright"
          >
            {row.prospectName ?? (site === '' ? strings.common.unknownSite : site)}
          </Link>
          <Badge tone={type.tone} className="whitespace-nowrap">
            {type.label}
          </Badge>
        </div>
        <div className="ident truncate text-xs text-ink-muted">
          {row.prospectName !== undefined && site !== '' ? site : null}
          {detail !== undefined ? (
            <span className="ml-2 inline-flex items-center gap-1.5 text-ink-soft">
              <StatusDot status={row.status} />
              {detail}
            </span>
          ) : null}
        </div>
      </div>
      <Button
        variant={row.status === 'running' ? 'danger' : 'ghost'}
        size="sm"
        className="shrink-0"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </li>
  );
}

/** The run list's own state, read as one line rather than as separate boxes.
 *  Running, needs input, complete, report issue and failed are states of the same list, so they sit
 *  together and separated only by spacing. */
function QueueReadout(props: {
  kpis: AuditsKpis;
  state: KpiValueState;
  unavailableLabel: string;
}): JSX.Element {
  const { strings } = useI18n();
  const { kpis, state, unavailableLabel } = props;
  const entries = [
    { key: 'running', label: strings.audits.kpiRunning, value: kpis.running },
    { key: 'needs-input', label: strings.audits.kpiNeedsInput, value: kpis.needsInput },
    { key: 'complete', label: strings.audits.kpiComplete, value: kpis.complete },
    { key: 'report-issue', label: strings.audits.kpiReportIssue, value: kpis.reportIssue },
    { key: 'failed', label: strings.audits.kpiFailed, value: kpis.failed },
  ];
  return (
    <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
      {entries.map((entry) => (
        <div key={entry.key} className="flex items-baseline gap-2">
          <dt className="text-xs text-ink-muted">{entry.label}</dt>
          {state === 'loading' ? (
            <Skeleton className="h-4 w-6" />
          ) : (
            <dd
              className={cn(
                'numeric text-base font-semibold',
                state === 'unavailable' ? 'text-ink-muted' : 'text-ink',
              )}
            >
              {state === 'unavailable' ? unavailableLabel : entry.value}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/** The four severity counts of one run, in fixed severity order. Absent
 *  severities hold their place with a dash rather than collapsing the row, so
 *  the numbers stay in the same four columns all the way down the table and a
 *  glance compares like with like. */
function SeverityCounts({ badges }: { badges: SeverityBadge[] }): JSX.Element {
  const { strings } = useI18n();
  if (badges.length === 0) return <span className="text-ink-muted">-</span>;
  const byKey = new Map(badges.map((badge) => [badge.key, badge.count]));
  return (
    <div className="flex items-baseline gap-3">
      {SEVERITIES.map((severity) => {
        const count = byKey.get(severity);
        return (
          <span
            key={severity}
            className={cn(
              'numeric w-9 text-sm',
              count === undefined ? 'text-ink-muted' : SEVERITY_TEXT[severity],
            )}
            title={strings.common.severityLabels[severity]}
          >
            {count ?? '-'}
          </span>
        );
      })}
    </div>
  );
}

const SEVERITY_TEXT: Record<SeverityKey, string> = {
  critical: 'text-sev-critical',
  serious: 'text-sev-serious',
  moderate: 'text-sev-moderate',
  minor: 'text-sev-minor',
};

const SEVERITIES: readonly SeverityKey[] = ['critical', 'serious', 'moderate', 'minor'];
