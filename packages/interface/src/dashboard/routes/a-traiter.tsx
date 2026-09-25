import { useState } from 'react';
import type { JSX } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Select } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { useI18n } from '../i18n/provider';
import { ApiError, sendJson } from '../lib/api';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { useTodoPoll } from '../app/todo-poll';
import type { AttentionTodoRow, TodoRow, TodoRowKind } from '../lib/api-types';

const SKELETON_ROW_COUNT = 6;

const KIND_TONE: Record<TodoRowKind, BadgeTone> = {
  draft: 'neutral',
  reply: 'accent',
  'follow-up': 'neutral',
  'first-email': 'accent',
  'audit-input': 'serious',
  'audit-report': 'serious',
  'report-quality-review': 'serious',
};

/** Plan 060 §8: attention rows are exactly the rows carrying the stable
 *  attention id; they reuse the attention copy tables for their decision
 *  label and severity chip instead of the prospect-work kind labels. */
function isAttentionRow(row: TodoRow): row is AttentionTodoRow {
  return 'attentionId' in row;
}

/** The dashboard's landing page and the operator's inbox: every row is derived
 * from a durable prospect and opens that prospect's actionable page. */
export function ATraiterPage(): JSX.Element {
  const { strings, language } = useI18n();
  const navigate = useNavigate();
  // Issue #514: the shell's To-do poll, not a second one of our own.
  const { data, error, refresh } = useTodoPoll();

  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<TodoRowKind | 'all'>('all');
  const syncMailbox = async (): Promise<void> => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const result = await sendJson<{ sent: number; replies: number; review: number }>(
        '/api/outreach/mailbox-sync',
        'POST',
        {},
        { timeoutMs: 120_000 },
      );
      setSyncNotice(
        strings.aTraiter.syncMailboxDone
          .replace('{sent}', String(result.sent))
          .replace('{replies}', String(result.replies))
          .replace('{review}', String(result.review)),
      );
      refresh();
    } catch (syncError) {
      setSyncNotice(
        syncError instanceof ApiError && syncError.status === 503
          ? strings.aTraiter.syncMailboxNotConfigured
          : strings.aTraiter.syncMailboxFailed,
      );
    } finally {
      setSyncing(false);
    }
  };

  const visibleRows =
    data === undefined || kindFilter === 'all'
      ? (data?.rows ?? [])
      : data.rows.filter((row) => row.kind === kindFilter);

  let body: JSX.Element;
  if (error !== undefined && data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-ink-muted">{strings.common.requestFailed}</p>
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
  } else if (visibleRows.length === 0) {
    body = (
      <EmptyState
        icon={CheckCircle2}
        title={
          kindFilter === 'all' ? strings.aTraiter.empty : strings.aTraiter.overview.filteredEmpty
        }
      />
    );
  } else {
    body = (
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{strings.aTraiter.table.subjectHeader}</TableHeaderCell>
              <TableHeaderCell>{strings.aTraiter.table.actionHeader}</TableHeaderCell>
              <TableHeaderCell className="w-40">
                {strings.aTraiter.table.sinceHeader}
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row: TodoRow) => {
              const kindLabel = isAttentionRow(row)
                ? strings.attention.kinds[row.kind]
                : strings.aTraiter.kinds[row.kind];
              return (
                <TableRow key={`${row.kind}-${row.href}`} onClick={() => navigate(row.href)}>
                  <TableCell>
                    <span className="mb-1 inline-block">
                      {isAttentionRow(row) ? (
                        <Badge tone="serious">{strings.attention.severities[row.severity]}</Badge>
                      ) : (
                        <Badge tone={KIND_TONE[row.kind]}>{kindLabel}</Badge>
                      )}
                    </span>
                    {isAttentionRow(row) ? (
                      <span className="mb-1 block text-sm font-medium text-ink">{kindLabel}</span>
                    ) : null}
                    <Link
                      to={row.href}
                      className="block font-medium text-ink hover:text-accent-bright"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.subject}
                    </Link>
                  </TableCell>
                  <TableCell>{strings.aTraiter.actions[row.action]}</TableCell>
                  <TableCell className="numeric whitespace-nowrap text-xs text-ink-muted">
                    {isAttentionRow(row)
                      ? strings.attention.since.replace(
                          '{since}',
                          formatDateTime(row.since, language),
                        )
                      : formatRelativeTime(row.since, strings.common.relativeTime)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <article className={PAGE_WIDTH.surface}>
      <PageHeader
        title={strings.aTraiter.title}
        description={strings.aTraiter.description}
        actions={
          <Button variant="secondary" isLoading={syncing} onClick={() => void syncMailbox()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {strings.aTraiter.syncMailbox}
          </Button>
        }
      />
      {syncNotice !== null ? (
        <p className="mb-3 text-sm text-ink-muted" role="status">
          {syncNotice}
        </p>
      ) : null}
      {data !== undefined ? (
        <Card title={strings.aTraiter.overview.heading} className="mb-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <OverviewMetric
              label={strings.aTraiter.overview.auditedProspects}
              value={data.summary.auditedProspects}
            />
            <OverviewMetric
              label={strings.aTraiter.overview.activeProspects}
              value={data.summary.activeProspects}
            />
            <OverviewMetric
              label={strings.aTraiter.overview.actionableProspects}
              value={data.summary.actionableProspects}
            />
            <OverviewMetric
              label={strings.aTraiter.overview.actionableItems}
              value={data.summary.actionableItems}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span>
              {strings.aTraiter.overview.reconciliation
                .replace('{audited}', String(data.summary.auditedProspects))
                .replace('{actions}', String(data.summary.actionableItems))}
            </span>
            <Badge tone={data.attentionCount > 0 ? 'serious' : 'neutral'}>
              {strings.aTraiter.overview.attentionItems}: {data.attentionCount}
            </Badge>
            <Badge tone={data.summary.mailboxConfigured ? 'accent' : 'neutral'}>
              {strings.aTraiter.overview.mailbox}:{' '}
              {data.summary.mailboxConfigured
                ? strings.aTraiter.overview.mailboxConfigured
                : strings.aTraiter.overview.mailboxNotConfigured}
            </Badge>
            <span>
              {strings.aTraiter.overview.mailboxLastSync}:{' '}
              {data.summary.lastSyncAt === null
                ? strings.aTraiter.overview.mailboxNeverSynced
                : formatDateTime(data.summary.lastSyncAt, language)}
            </span>
          </div>
          <label className="mt-3 flex max-w-xs items-center gap-2 text-xs text-ink-muted">
            {strings.aTraiter.overview.kindFilterLabel}
            <Select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as TodoRowKind | 'all')}
            >
              <option value="all">{strings.aTraiter.overview.allKinds}</option>
              {(Object.keys(data.summary.kindCounts) as TodoRowKind[])
                .filter((kind) => data.summary.kindCounts[kind] > 0)
                .map((kind) => (
                  <option key={kind} value={kind}>
                    {strings.aTraiter.overview.kindLabels[kind]} ({data.summary.kindCounts[kind]})
                  </option>
                ))}
            </Select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(data.summary.kindCounts) as TodoRowKind[])
              .filter((kind) => data.summary.kindCounts[kind] > 0)
              .map((kind) => (
                <Badge key={kind} tone={KIND_TONE[kind]}>
                  {strings.aTraiter.overview.kindLabels[kind]}: {data.summary.kindCounts[kind]}
                </Badge>
              ))}
          </div>
        </Card>
      ) : null}
      <p
        className="mb-4 rounded-xl border border-line-strong bg-panel px-5 py-4 text-sm font-medium text-ink"
        role="note"
      >
        {strings.drafts.neverSendNote}
      </p>
      {error !== undefined && data !== undefined ? (
        <div className="mb-3 text-xs text-ink-muted" role="alert">
          <p>{strings.common.requestFailed}</p>
          <p>{error}</p>
        </div>
      ) : null}
      {body}
    </article>
  );
}

function OverviewMetric(props: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2">
      <p className="numeric text-xl font-semibold text-ink">{props.value}</p>
      <p className="text-xs text-ink-muted">{props.label}</p>
    </div>
  );
}
