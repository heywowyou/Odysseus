import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ChevronRight, Radar } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
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
import { fetchJson } from '../lib/api';
import type { JobStatus, ScanSummary } from '../lib/api-types';
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

const STATUS_OPTIONS: readonly JobStatus[] = ['queued', 'running', 'complete', 'failed'];

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
                          className="font-medium text-ink hover:text-accent"
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
                        <ChevronRight
                          className="ml-auto size-4 text-ink-muted"
                          aria-hidden="true"
                        />
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
          <Link to="/scans/new" className={buttonStyles('primary')}>
            {strings.nav.newScan}
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={strings.audits.kpiRunning} value={kpis.running} />
        <KpiTile label={strings.audits.kpiComplete} value={kpis.complete} />
        <KpiTile label={strings.audits.kpiFailed} value={kpis.failed} />
        <KpiTile
          label={strings.audits.kpiCritical}
          value={kpis.critical}
          tone={kpis.critical > 0 ? 'critical' : 'default'}
        />
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
    </article>
  );
}
