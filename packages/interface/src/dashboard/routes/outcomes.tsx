import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ChartPie } from 'lucide-react';
import { PageHeader } from '../components/page-header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { KpiTile } from '../components/ui/kpi';
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
import { fetchJson, postEmpty } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import {
  PAGE_SIZE,
  clampedOffset,
  pageState,
  summaryLostReasonCounts,
  summaryOutcomeCounts,
} from './outreach-model';
import type { OutcomesPage } from './outreach-model';

const POLL_INTERVAL_MS = 5000;
const SKELETON_ROW_COUNT = 8;

export function OutcomesPage(): JSX.Element {
  const { strings, language } = useI18n();
  const [offset, setOffset] = useState(0);
  const { data, error, refresh } = usePolling(
    () => fetchJson<OutcomesPage>(`/api/outreach/outcomes?limit=${PAGE_SIZE}&offset=${offset}`),
    POLL_INTERVAL_MS,
    { key: `outreach-outcomes:${offset}` },
  );
  // The thread waiting for its opt-out confirmation, or null with the
  // dialog closed.
  const [optOutThreadId, setOptOutThreadId] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);

  useEffect(() => {
    if (data !== undefined && offset !== clampedOffset(data.total, PAGE_SIZE, offset)) {
      setOffset(clampedOffset(data.total, PAGE_SIZE, offset));
    }
  }, [data, offset]);

  const optOut = async (): Promise<void> => {
    if (optOutThreadId === null) return;
    setActionFailed(false);
    try {
      await postEmpty(`/api/outreach/threads/${optOutThreadId}/opt-out`);
      refresh();
    } catch {
      setActionFailed(true);
    }
  };

  const summary = data?.summary;
  const outcomeCounts = summary === undefined ? [] : summaryOutcomeCounts(summary.byOutcome);
  const lostReasonCounts =
    summary === undefined ? [] : summaryLostReasonCounts(summary.byLostReason);

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
  } else if (data.rows.length === 0 && offset === 0) {
    body = <EmptyState icon={ChartPie} title={strings.outcomes.empty} />;
  } else {
    const pages = pageState(data.total, PAGE_SIZE, offset);
    body = (
      <>
        {actionFailed ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {strings.operator.actionError}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{strings.outcomes.columns.hotel}</TableHeaderCell>
                <TableHeaderCell>{strings.outcomes.columns.outcome}</TableHeaderCell>
                <TableHeaderCell>{strings.outcomes.columns.setAt}</TableHeaderCell>
                <TableHeaderCell className="w-36">{null}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((event) => (
                <TableRow key={event.outcomeId}>
                  <TableCell>
                    <span className="font-medium text-ink">{event.candidateId}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-ink">{event.outcome}</span>
                    {event.lostReason !== null ? (
                      <span className="ml-2 text-xs text-ink-muted">({event.lostReason})</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatDateTime(event.recordedAt, language)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setOptOutThreadId(event.threadId)}
                    >
                      {strings.outcomes.optOut}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages.hasPrevious || pages.hasNext ? (
          <nav className="mt-4 flex items-center justify-between" aria-label="pagination">
            <Button
              variant="secondary"
              size="sm"
              disabled={!pages.hasPrevious}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              {strings.operator.paginationPrevious}
            </Button>
            <span className="text-xs text-ink-muted">
              {strings.operator.paginationPageOf
                .replace('{page}', String(pages.page))
                .replace('{pages}', String(pages.pages))}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pages.hasNext}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {strings.operator.paginationNext}
            </Button>
          </nav>
        ) : null}
      </>
    );
  }

  return (
    <article>
      <PageHeader title={strings.outcomes.title} description={strings.outcomes.description} />

      {/* The first tile is the campaign total (borrowing the score page's
          "Total" label); the rest are the per-outcome counts in lifecycle
          order. */}
      <Card className="mb-4" title={strings.outcomes.summaryHeading}>
        {summary === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiTile label={strings.score.totalLabel} value={summary.total} />
              {outcomeCounts.map((count) => (
                <KpiTile key={count.outcome} label={count.outcome} value={count.count} />
              ))}
            </div>
            {lostReasonCounts.length > 0 ? (
              <p className="mt-3 text-xs text-ink-muted">
                {lostReasonCounts.map((count) => `${count.reason}: ${count.count}`).join(', ')}
              </p>
            ) : null}
          </>
        )}
      </Card>

      {body}

      <ConfirmDialog
        open={optOutThreadId !== null}
        onOpenChange={(open) => {
          if (!open) setOptOutThreadId(null);
        }}
        title={strings.outcomes.optOut}
        description={strings.outcomes.description}
        confirmLabel={strings.outcomes.optOut}
        cancelLabel={strings.common.cancel}
        onConfirm={optOut}
      />
    </article>
  );
}
