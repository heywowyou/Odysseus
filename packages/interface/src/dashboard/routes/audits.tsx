import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ChevronRight, Radar, Square, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Input } from '../components/ui/input';
import { KpiTile } from '../components/ui/kpi';
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
import type { JobStatus, ScanSummary } from '../lib/api-types';
import { canDelete, canStop } from '../lib/job-actions';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import {
  computeKpis,
  filterSummaries,
  rowTarget,
  searchMatches,
  severityBadges,
  siteLabel,
  sortSummaries,
} from './audits-model';
import type { SeverityBadge, SortOrder, StatusFilter } from './audits-model';

const POLL_INTERVAL_MS = 5000;
const SKELETON_ROW_COUNT = 8;

const STATUS_OPTIONS: readonly JobStatus[] = [
  'queued',
  'running',
  'complete',
  'failed',
  'cancelled',
];

/** The one confirm dialog this page can open: at most a single action is
 *  ever pending, so a row button replaces whatever the dialog showed. */
interface PendingScanAction {
  kind: 'stop' | 'delete' | 'clear-queue';
  row?: ScanSummary;
}

function typeBadge(
  summary: ScanSummary,
  strings: DashboardStrings,
): { tone: BadgeTone; label: string } {
  if (summary.type === 'full-audit') {
    return { tone: 'accent', label: strings.common.typeLabels.fullAudit };
  }
  return { tone: 'neutral', label: strings.common.typeLabels.prospecting };
}

export function AuditsPage(): JSX.Element {
  const { strings, language } = useI18n();
  const navigate = useNavigate();
  // Poll errors keep the last good data on screen, so a blip never blanks a
  // list the operator is reading; the error surfaces as a line instead.
  const { data, error, lastUpdatedAt, refresh } = usePolling(
    () => fetchJson<ScanSummary[]>('/api/scans?limit=200'),
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
          searchMatches(summary, search),
        ),
        sortOrder,
      ),
    [data, statusFilter, search, sortOrder],
  );
  const kpis = useMemo(() => computeKpis(data ?? []), [data]);
  const queuedCount = useMemo(
    () => (data ?? []).filter((summary) => summary.status === 'queued').length,
    [data],
  );

  /** One mutation wrapper for stop and delete: the distinction between a 409
   *  (the job just went terminal) and a network blip carries no different
   *  copy, and the refreshed list carries the truth either way. */
  const runRowAction = async (row: ScanSummary, kind: 'stop' | 'delete'): Promise<void> => {
    try {
      if (kind === 'stop') {
        await postEmpty(`/api/scans/${encodeURIComponent(row.jobId)}/cancel`);
        toast.success(strings.audits.stoppedMessage);
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
  const pendingSite = pendingRow === undefined ? '' : siteLabel(pendingRow);

  let body: JSX.Element;
  if (data === undefined && error !== undefined) {
    body = (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">{error}</p>
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
          <p className="mb-3 text-xs text-ink-muted" role="alert">
            {error}
          </p>
        ) : null}
        {visible.length === 0 ? (
          <EmptyState title={strings.audits.emptyFilter} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell className="w-56">{strings.audits.dateColumn}</TableHeaderCell>
                  <TableHeaderCell>{strings.audits.siteColumn}</TableHeaderCell>
                  <TableHeaderCell>{strings.audits.typeColumn}</TableHeaderCell>
                  <TableHeaderCell>{strings.audits.statusColumn}</TableHeaderCell>
                  <TableHeaderCell>{strings.audits.severityColumn}</TableHeaderCell>
                  <TableHeaderCell className="w-10">{null}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((summary) => {
                  const target = rowTarget(summary);
                  const site = siteLabel(summary);
                  const badges: SeverityBadge[] = severityBadges(summary.severityRollup);
                  const type = typeBadge(summary, strings);
                  return (
                    <TableRow key={summary.jobId} onClick={() => navigate(target)}>
                      <TableCell>
                        <div className="text-ink">
                          {formatDateTime(summary.createdAt, language)}
                        </div>
                        <div className="text-xs text-ink-muted">
                          {formatRelativeTime(summary.createdAt, strings.common.relativeTime)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* The visible link is the keyboard-accessible path to
                            the row target; the row click is the mouse shortcut. */}
                        <Link
                          to={target}
                          className="font-medium text-ink hover:text-accent-bright"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {site === '' ? strings.common.unknownSite : site}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge tone={type.tone}>{type.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <StatusDot status={summary.status} />
                          {strings.common.statusLabels[summary.status]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {badges.map((badge) => (
                            <Badge key={badge.key} tone={badge.key}>
                              {badge.count}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Row mutations stop the row click so pointing at
                            stop or delete never navigates by accident; the
                            chevron stays the row's own navigation affordance. */}
                        <div className="flex items-center justify-end gap-1">
                          {canStop(summary.status) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2"
                              aria-label={strings.audits.stopAction}
                              title={strings.audits.stopAction}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPendingAction({ kind: 'stop', row: summary });
                              }}
                            >
                              <Square className="size-4" aria-hidden="true" />
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
    <article>
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
      />

      {/* Staggered entrance: each tile starts 50 ms after the previous one,
          with the animation's backwards fill keeping late tiles invisible
          until their turn. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          <KpiTile key="running" label={strings.audits.kpiRunning} value={kpis.running} />,
          <KpiTile key="complete" label={strings.audits.kpiComplete} value={kpis.complete} />,
          <KpiTile key="failed" label={strings.audits.kpiFailed} value={kpis.failed} />,
          <KpiTile
            key="critical"
            label={strings.audits.kpiCritical}
            value={kpis.critical}
            tone={kpis.critical > 0 ? 'critical' : 'default'}
          />,
        ].map((tile, slot) => (
          <div
            key={tile.key}
            style={{ animationDelay: `${slot * 50}ms` }}
            className="animate-page-in"
          >
            {tile}
          </div>
        ))}
      </div>

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
            : pendingAction?.kind === 'delete'
              ? strings.audits.confirmDeleteTitle
              : strings.audits.confirmClearQueueTitle
        }
        description={
          pendingAction?.kind === 'stop'
            ? strings.audits.confirmStopBody
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
            : pendingAction?.kind === 'delete'
              ? strings.audits.deleteAction
              : strings.audits.clearQueue
        }
        cancelLabel={strings.common.cancel}
        onConfirm={async () => {
          const action = pendingAction;
          if (action === null) return;
          if ((action.kind === 'stop' || action.kind === 'delete') && action.row !== undefined) {
            await runRowAction(action.row, action.kind);
            return;
          }
          await clearQueue();
        }}
      />
    </article>
  );
}
