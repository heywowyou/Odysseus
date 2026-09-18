import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Radar, Square, Trash2 } from 'lucide-react';
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
import { fetchJson, fetchJsonValidated, postEmpty, sendDelete, sendJson } from '../lib/api';
import { scanQueueSchema } from '../lib/api-schemas';
import type { QueuedScan, ScanQueue, ScanSummary } from '../lib/api-types';
import type { DisplayJobStatus } from '../lib/job-outcome';
import { blockedReasonCopy, isStateChanged, problemCopy } from '../lib/operator-copy';
import { moveInOrder } from '../lib/queue-order';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import { currentPhaseLabel } from './scan-progress-model';
import {
  computeKpis,
  filterSummaries,
  listStatus,
  rowTarget,
  runningScans,
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
// Plan 061 §10.3: the queue is an active list, polled in the 5-10s class.
const QUEUE_POLL_INTERVAL_MS = 5_000;
const SKELETON_ROW_COUNT = 8;

const STATUS_OPTIONS: readonly DisplayJobStatus[] = [
  'queued',
  'running',
  'cancel-requested',
  'complete',
  'report-issue',
  'failed',
  'needs-input',
  'cancelled',
];

/** The one confirm dialog this page can open: at most a single action is
 *  ever pending, so a row button replaces whatever the dialog showed. Row
 *  actions carry the state token of the server capability they were
 *  rendered from (plan 061 §8). */
type PendingScanAction =
  | { kind: 'stop' | 'delete' | 'remove'; jobId: string; site: string; stateToken: string }
  | { kind: 'clear-queue' };

function typeBadge(
  summary: Pick<ScanSummary, 'type'>,
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
  const running = useMemo(() => runningScans(data ?? []), [data]);
  const { data: queueData, refresh: refreshQueue } = usePolling(
    (signal) => fetchJsonValidated('/api/scans/queue', scanQueueSchema, { signal }),
    QUEUE_POLL_INTERVAL_MS,
    { key: 'scan-queue' },
  );
  const upNext = queueData?.jobs ?? [];
  const queuedCount = upNext.length;
  const [reorderBusy, setReorderBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const refreshAll = (): void => {
    refresh();
    refreshQueue();
  };

  /** One mutation wrapper for stop, remove and delete. A typed problem
   *  picks its own recovery copy; a stale view refreshes at once. */
  const runRowAction = async (
    action: Extract<PendingScanAction, { jobId: string }>,
  ): Promise<void> => {
    const path = `/api/scans/${encodeURIComponent(action.jobId)}`;
    try {
      if (action.kind === 'stop' || action.kind === 'remove') {
        // Removing a waiting scan is the same cancel as stopping one; only
        // the wording differs, since nothing has started yet.
        await sendJson(`${path}/cancel`, 'POST', { stateToken: action.stateToken });
        toast.success(
          action.kind === 'remove'
            ? strings.scanQueue.removedMessage
            : strings.audits.stoppedMessage,
        );
      } else {
        await sendDelete(`${path}?stateToken=${encodeURIComponent(action.stateToken)}`);
        toast.success(strings.audits.deletedMessage);
      }
    } catch (error) {
      toast.error(problemCopy(error, strings.workState) ?? strings.audits.actionFailed);
    }
    // The poll keeps last good data for seconds; refresh shows the new
    // status now, and after a conflict it is the recovery.
    refreshAll();
  };

  const clearQueue = async (): Promise<void> => {
    try {
      const result = await postEmpty<{ cleared: number }>('/api/scans/queue/clear');
      toast.success(strings.audits.queueClearedMessage.replace('{count}', String(result.cleared)));
      refreshAll();
    } catch {
      toast.error(strings.audits.actionFailed);
    }
  };

  /** Plan 061 §6.2: a one-step move sends the complete new order with the
   *  revision it was computed from; a stale revision refreshes the queue. */
  const moveQueued = async (
    queue: ScanQueue,
    row: QueuedScan,
    direction: 'up' | 'down',
  ): Promise<void> => {
    const ids = queue.jobs.map((job) => job.jobId);
    const orderedJobIds = moveInOrder(ids, row.jobId, direction);
    if (orderedJobIds === undefined || reorderBusy) return;
    setReorderBusy(true);
    const name = queuedName(row);
    try {
      await sendJson('/api/scans/queue/reorder', 'POST', {
        queueRevision: queue.queueRevision,
        orderedJobIds,
      });
      setAnnouncement(
        strings.workState.movedAnnouncement
          .replace('{name}', name)
          .replace('{position}', String(orderedJobIds.indexOf(row.jobId) + 1)),
      );
    } catch (error) {
      toast.error(
        isStateChanged(error)
          ? strings.workState.queueChanged
          : (problemCopy(error, strings.workState) ?? strings.audits.actionFailed),
      );
    } finally {
      setReorderBusy(false);
      refreshQueue();
    }
  };

  const queuedName = (row: QueuedScan): string => {
    const site = siteLabel(row, strings.audits);
    return row.prospectName ?? (site === '' ? strings.common.unknownSite : site);
  };

  const pendingSite =
    pendingAction === null || pendingAction.kind === 'clear-queue' ? '' : pendingAction.site;

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
                            {summary.prospectName ?? strings.nav.prospects}
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
                          {summary.capabilities.cancel.state === 'available' ? (
                            <Button
                              variant="danger"
                              size="sm"
                              className="gap-1.5 px-2"
                              aria-label={strings.audits.stopAction}
                              title={strings.audits.stopAction}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPendingAction({
                                  kind: summary.status === 'queued' ? 'remove' : 'stop',
                                  jobId: summary.jobId,
                                  site,
                                  stateToken: summary.capabilities.cancel.stateToken,
                                });
                              }}
                            >
                              <Square className="size-3 fill-current" aria-hidden="true" />
                              <span className="text-xs">{strings.audits.stopAction}</span>
                            </Button>
                          ) : null}
                          <DeleteControl
                            summary={summary}
                            onDelete={(stateToken) =>
                              setPendingAction({
                                kind: 'delete',
                                jobId: summary.jobId,
                                site,
                                stateToken,
                              })
                            }
                          />
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

      {/* Polite, throttled to meaningful transitions: only a reorder the
          operator made is announced, never a poll tick. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {running.length > 0 || upNext.length > 0 ? (
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
              {running.length === 0 ? (
                <p className="text-sm text-ink-muted">{strings.scanQueue.noRunning}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {running.map((row) => {
                    const site = siteLabel(row, strings.audits);
                    const cancel = row.capabilities.cancel;
                    return (
                      <QueueRow
                        key={row.jobId}
                        name={row.prospectName ?? (site === '' ? strings.common.unknownSite : site)}
                        site={row.prospectName !== undefined ? site : ''}
                        target={rowTarget(row)}
                        type={typeBadge(row, strings)}
                        status={row.status}
                        detail={
                          row.status === 'cancel-requested'
                            ? strings.workState.states['cancel-requested']
                            : currentPhaseLabel(row.phase, strings.progress.phaseLabels)
                        }
                        {...(cancel.state === 'available'
                          ? {
                              actionLabel: strings.audits.stopAction,
                              onAction: () =>
                                setPendingAction({
                                  kind: 'stop',
                                  jobId: row.jobId,
                                  site,
                                  stateToken: cancel.stateToken,
                                }),
                            }
                          : {})}
                      />
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="scan-queue-up-next">
              <h3 id="scan-queue-up-next" className="mb-2 text-xs font-medium text-ink-soft">
                {strings.scanQueue.upNextHeading.replace('{count}', String(upNext.length))}
              </h3>
              {upNext.length === 0 || queueData === undefined ? (
                <p className="text-sm text-ink-muted">{strings.scanQueue.noWaiting}</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {upNext.map((row, index) => {
                    const site = siteLabel(row, strings.audits);
                    const name = queuedName(row);
                    return (
                      <QueueRow
                        key={row.jobId}
                        name={name}
                        site={row.prospectName !== undefined ? site : ''}
                        target={`/scans/${encodeURIComponent(row.jobId)}`}
                        type={typeBadge(row, strings)}
                        status="queued"
                        position={row.position}
                        {...(row.cancel.state === 'available'
                          ? {
                              actionLabel: strings.scanQueue.removeAction,
                              onAction: () =>
                                setPendingAction({
                                  kind: 'remove',
                                  jobId: row.jobId,
                                  site,
                                  stateToken: row.cancel.stateToken,
                                }),
                            }
                          : {})}
                        reorder={
                          queueData.truncated
                            ? undefined
                            : {
                                busy: reorderBusy,
                                canMoveUp: index > 0,
                                canMoveDown: index < upNext.length - 1,
                                moveUpLabel: strings.workState.moveUpAria.replace('{name}', name),
                                moveDownLabel: strings.workState.moveDownAria.replace(
                                  '{name}',
                                  name,
                                ),
                                onMove: (direction) => void moveQueued(queueData, row, direction),
                              }
                        }
                      />
                    );
                  })}
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
          if (action.kind !== 'clear-queue') {
            await runRowAction(action);
            return;
          }
          await clearQueue();
        }}
      />
    </article>
  );
}

/** One line of the scan queue: the prospect (or the site when the scan is not
 *  linked to one), the scan type, the phase of a running scan, its one
 *  action, and for a waiting scan the keyboard-operable reorder buttons. */
function QueueRow(props: {
  name: string;
  site: string;
  target: string;
  type: { tone: BadgeTone; label: string };
  status: ScanSummary['status'];
  position?: number;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  reorder?:
    | {
        busy: boolean;
        canMoveUp: boolean;
        canMoveDown: boolean;
        moveUpLabel: string;
        moveDownLabel: string;
        onMove: (direction: 'up' | 'down') => void;
      }
    | undefined;
}): JSX.Element {
  const { name, site, target, type, status, position, detail, actionLabel, onAction, reorder } =
    props;
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-line bg-raised px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          {position !== undefined ? (
            <span className="numeric text-xs text-ink-muted">{position}.</span>
          ) : null}
          <Link
            to={target}
            className="truncate text-sm font-medium text-ink hover:text-accent-bright"
          >
            {name}
          </Link>
          <Badge tone={type.tone} className="whitespace-nowrap">
            {type.label}
          </Badge>
        </div>
        <div className="ident truncate text-xs text-ink-muted">
          {site !== '' ? site : null}
          {detail !== undefined ? (
            <span className="ml-2 inline-flex items-center gap-1.5 text-ink-soft">
              <StatusDot status={status} />
              {detail}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {reorder !== undefined ? (
          <>
            <ReorderButton
              label={reorder.moveUpLabel}
              enabled={reorder.canMoveUp && !reorder.busy}
              onClick={() => reorder.onMove('up')}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </ReorderButton>
            <ReorderButton
              label={reorder.moveDownLabel}
              enabled={reorder.canMoveDown && !reorder.busy}
              onClick={() => reorder.onMove('down')}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </ReorderButton>
          </>
        ) : null}
        {actionLabel !== undefined && onAction !== undefined ? (
          <Button variant={status === 'running' ? 'danger' : 'ghost'} size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** aria-disabled rather than disabled, so the control stays in the tab order
 *  at the ends of the queue and keeps its position among its siblings. */
function ReorderButton(props: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  children: JSX.Element;
}): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('px-2', props.enabled ? undefined : 'opacity-40')}
      aria-label={props.label}
      title={props.label}
      aria-disabled={props.enabled ? undefined : true}
      onClick={() => {
        if (props.enabled) props.onClick();
      }}
    >
      {props.children}
    </Button>
  );
}

/** Delete for one history row, driven by the server capability. A running
 *  row offers Stop instead; a row the server blocks for a transient reason
 *  (a stopped job still finishing, a report in production) keeps a focusable
 *  aria-disabled control whose description says why. */
function DeleteControl(props: {
  summary: ScanSummary;
  onDelete: (stateToken: string) => void;
}): JSX.Element | null {
  const { strings } = useI18n();
  const capability = props.summary.capabilities.delete;
  if (capability.state === 'available') {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="px-2"
        aria-label={strings.audits.deleteAction}
        title={strings.audits.deleteAction}
        onClick={(event) => {
          event.stopPropagation();
          props.onDelete(capability.stateToken);
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    );
  }
  if (capability.reasonCode === 'work-running') return null;
  const reason = blockedReasonCopy(capability, strings.workState) ?? '';
  return (
    <Button
      variant="ghost"
      size="sm"
      className="px-2 opacity-40"
      aria-disabled={true}
      aria-label={`${strings.audits.deleteAction} : ${reason}`}
      title={reason}
      onClick={(event) => {
        event.stopPropagation();
        toast.info(reason);
      }}
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </Button>
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
