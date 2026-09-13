import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ChartPie } from 'lucide-react';
import { Link } from 'react-router';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
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
import { vocabularyLabel } from '../lib/vocabulary';
import { cn } from '../lib/cn';
import { fetchJson } from '../lib/api';
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

// Plan 040 poll policy: lists refresh every 10s (usePolling also pauses
// every poll while the tab is hidden).
const POLL_INTERVAL_MS = 10_000;
const SKELETON_ROW_COUNT = 8;

/** Outcomes are mutually exclusive end states of one campaign, so the honest
 *  drawing is a distribution: every row sized against the same total, in the
 *  vocabulary's own lifecycle order. Identical tiles per outcome hid exactly
 *  the thing an operator opens this page for, which is the shape of the
 *  funnel rather than eight unrelated numbers. */
function DistributionList(props: {
  rows: { key: string; label: string; value: number }[];
  total: number;
  muted?: boolean;
}): JSX.Element {
  const { rows, total, muted = false } = props;
  return (
    <dl className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <dt className="w-52 shrink-0 truncate text-[13px] text-ink-soft">{row.label}</dt>
          <div className="h-2 min-w-0 flex-1 rounded-full bg-raised" aria-hidden="true">
            <div
              className={cn('h-full rounded-full', muted ? 'bg-line-strong' : 'bg-accent')}
              style={{ width: total === 0 ? '0%' : `${(row.value / total) * 100}%` }}
            />
          </div>
          <dd className="numeric w-10 shrink-0 text-right text-sm text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OutcomesPage(): JSX.Element {
  const { strings, language } = useI18n();
  const [offset, setOffset] = useState(0);
  const { data, error, refresh } = usePolling(
    (signal) =>
      fetchJson<OutcomesPage>(`/api/outreach/outcomes?limit=${PAGE_SIZE}&offset=${offset}`, {
        signal,
      }),
    POLL_INTERVAL_MS,
    { key: `outreach-outcomes:${offset}` },
  );

  useEffect(() => {
    if (data !== undefined && offset !== clampedOffset(data.total, PAGE_SIZE, offset)) {
      setOffset(clampedOffset(data.total, PAGE_SIZE, offset));
    }
  }, [data, offset]);

  const summary = data?.summary;
  const outcomeCounts = summary === undefined ? [] : summaryOutcomeCounts(summary.byOutcome);
  const lostReasonCounts =
    summary === undefined ? [] : summaryLostReasonCounts(summary.byLostReason);

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
  } else if (data.rows.length === 0 && offset === 0) {
    body = <EmptyState icon={ChartPie} title={strings.outcomes.empty} />;
  } else {
    const pages = pageState(data.total, PAGE_SIZE, offset);
    body = (
      <>
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{strings.outcomes.columns.prospect}</TableHeaderCell>
                <TableHeaderCell>{strings.outcomes.columns.outcome}</TableHeaderCell>
                <TableHeaderCell>{strings.outcomes.columns.setAt}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Plan 040 slice 6 (page destiny table): opt-out moved to the
                  hub's Resultat section, and each row now names the hotel and
                  opens its page. Only a candidate whose name is unknown
                  degrades to the raw identifier. */}
              {data.rows.map((event) => (
                <TableRow key={event.outcomeId}>
                  <TableCell>
                    <Link
                      to={`/prospects/${encodeURIComponent(event.candidateId)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {event.hotelName !== null ? (
                        <span className="text-ink">{event.hotelName}</span>
                      ) : (
                        <span className="ident text-ink">{event.candidateId}</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-ink">
                      {vocabularyLabel(
                        strings.labels.outcome,
                        event.outcome,
                        strings.common.vocabularyFallback,
                      )}
                    </span>
                    {event.lostReason !== null ? (
                      <span className="ml-2 text-xs text-ink-muted">
                        (
                        {vocabularyLabel(
                          strings.labels.lostReason,
                          event.lostReason,
                          strings.common.vocabularyFallback,
                        )}
                        )
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatDateTime(event.recordedAt, language)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages.hasPrevious || pages.hasNext ? (
          <nav
            className="mt-4 flex items-center justify-between"
            aria-label={strings.operator.paginationLabel}
          >
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
    <article className={PAGE_WIDTH.surface}>
      <PageHeader title={strings.outcomes.title} description={strings.outcomes.description} />

      <Card className="mb-4" title={strings.outcomes.summaryHeading}>
        {summary === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              {strings.score.totalLabel}{' '}
              <span className="numeric font-medium text-ink">{summary.total}</span>
            </p>
            <DistributionList
              rows={outcomeCounts.map((count) => ({
                key: count.outcome,
                label: vocabularyLabel(strings.labels.outcome, count.outcome, count.outcome),
                value: count.count,
              }))}
              total={summary.total}
            />
            {lostReasonCounts.length > 0 ? (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="mb-3 text-xs uppercase tracking-[0.14em] text-ink-muted">
                  {strings.outcomes.lostReasonsHeading}
                </h3>
                <DistributionList
                  rows={lostReasonCounts.map((count) => ({
                    key: count.reason,
                    label: vocabularyLabel(strings.labels.lostReason, count.reason, count.reason),
                    value: count.count,
                  }))}
                  total={lostReasonCounts.reduce((sum, count) => sum + count.count, 0)}
                  muted
                />
              </div>
            ) : null}
          </>
        )}
      </Card>

      {body}
    </article>
  );
}
