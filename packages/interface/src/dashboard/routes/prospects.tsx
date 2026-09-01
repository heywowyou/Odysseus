import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Building2, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { InfoTip } from '../components/ui/info-tip';
import { SegmentedControl } from '../components/ui/segmented';
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
import type { DashboardStrings } from '../i18n/types';
import { fetchJson } from '../lib/api';
import { usePolling } from '../lib/use-polling';
import { vocabularyLabel } from '../lib/vocabulary';
import {
  GROUP_STATUS_VALUES,
  IDENTITY_STATUS_VALUES,
  PROSPECT_QUEUES,
  QUEUE_LABEL_KEYS,
  QUALIFICATION_VALUES,
  REVIEW_STATE_VALUES,
  buildProspectsPath,
  clampOffset,
  createEmptyFilters,
  currentPage,
  isGroupStatusValue,
  isIdentityStatusValue,
  isQualificationValue,
  isReviewStateValue,
  locationLabel,
  qualificationBadgeTone,
  reviewBadgeTone,
  scoreLabel,
  totalPages,
} from './prospects-model';
import type {
  ProspectFilterState,
  ProspectListResponse,
  ProspectQueue,
  ProspectRow,
} from './prospects-model';

const POLL_INTERVAL_MS = 8000;
const SKELETON_ROW_COUNT = 8;

function reviewLabel(reviewState: string, strings: DashboardStrings): string {
  return vocabularyLabel(strings.labels.review, reviewState);
}

function detailTarget(row: ProspectRow): string {
  return `/prospects/${encodeURIComponent(row.candidateId)}`;
}

/** Header cell whose column name carries an inline info tip, for columns
 *  whose meaning one line of copy can settle (how the score, the
 *  qualification outcome, or the review state are produced). */
function HeaderWithTip(props: { label: string; hint: string }): JSX.Element {
  return (
    <TableHeaderCell>
      <span className="inline-flex items-center gap-1">
        {props.label}
        <InfoTip label={props.label} hint={props.hint} />
      </span>
    </TableHeaderCell>
  );
}

export function ProspectsPage(): JSX.Element {
  const { strings } = useI18n();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ProspectFilterState>(createEmptyFilters);
  const [requestedOffset, setRequestedOffset] = useState(0);

  const page = usePolling(
    () => fetchJson<ProspectListResponse>(buildProspectsPath(filters, requestedOffset)),
    POLL_INTERVAL_MS,
    // The path is the poll key: a filter or page change resets state and
    // refetches, an unrelated re-render never does.
    { key: buildProspectsPath(filters, requestedOffset) },
  );
  const data = page.data;

  // A filter change can shrink the total below the current offset; the
  // clamped value is what the table shows and what the next poll requests,
  // while the raw offset stays in state so paging back is still exact.
  const offset =
    data === undefined ? requestedOffset : clampOffset(data.total, data.limit, requestedOffset);
  const limit = data?.limit ?? 25;

  const applyFilters = (next: ProspectFilterState): void => {
    setFilters(next);
    setRequestedOffset(0);
  };

  const queueOptions = useMemo(
    () =>
      PROSPECT_QUEUES.map((queue) => ({
        value: queue,
        label: strings.prospects.queues[QUEUE_LABEL_KEYS[queue]],
      })),
    [strings],
  );

  let body: JSX.Element;
  if (data === undefined && page.error !== undefined) {
    body = (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">{page.error}</p>
          <Button variant="secondary" onClick={page.refresh}>
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
  } else if (data.rows.length === 0) {
    body = <EmptyState icon={Building2} title={strings.prospects.filterEmpty} />;
  } else {
    const pages = totalPages(data.total, limit);
    body = (
      <>
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-56">{strings.prospects.columns.name}</TableHeaderCell>
                <TableHeaderCell>{strings.prospects.columns.city}</TableHeaderCell>
                <TableHeaderCell>{strings.prospects.columns.identity}</TableHeaderCell>
                <TableHeaderCell>{strings.prospects.columns.group}</TableHeaderCell>
                <HeaderWithTip
                  label={strings.prospects.columns.qualification}
                  hint={strings.hints.qualification}
                />
                <HeaderWithTip
                  label={strings.prospects.columns.review}
                  hint={strings.hints.review}
                />
                <HeaderWithTip label={strings.prospects.columns.score} hint={strings.hints.score} />
                <TableHeaderCell>{strings.prospects.columns.contact}</TableHeaderCell>
                <TableHeaderCell>{strings.prospects.columns.thread}</TableHeaderCell>
                <TableHeaderCell>{strings.prospects.columns.outcome}</TableHeaderCell>
                <TableHeaderCell className="w-10">{null}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.candidateId} onClick={() => navigate(detailTarget(row))}>
                  <TableCell>
                    {/* The visible link is the keyboard-accessible path to
                        the row target; the row click is the mouse shortcut. */}
                    <Link
                      to={detailTarget(row)}
                      className="font-medium text-ink hover:text-accent-bright"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>{locationLabel(row)}</TableCell>
                  <TableCell className="text-xs text-ink-soft">
                    {vocabularyLabel(strings.labels.identity, row.identityStatus)}
                  </TableCell>
                  <TableCell className="text-xs text-ink-soft">
                    {vocabularyLabel(strings.labels.group, row.groupStatus)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={qualificationBadgeTone(row.qualificationOutcome)}>
                      {vocabularyLabel(strings.labels.qualification, row.qualificationOutcome)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={reviewBadgeTone(row.reviewState)}>
                      {reviewLabel(row.reviewState, strings)}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{scoreLabel(row)}</TableCell>
                  <TableCell className="text-xs text-ink-soft">
                    {vocabularyLabel(strings.labels.contact, row.contactState)}
                  </TableCell>
                  <TableCell className="text-xs text-ink-soft">
                    {vocabularyLabel(strings.labels.thread, row.threadState)}
                  </TableCell>
                  <TableCell className="text-xs text-ink-soft">
                    {vocabularyLabel(strings.labels.outcome, row.outcome)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="ml-auto size-4 text-ink-muted" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={offset === 0}
            onClick={() => setRequestedOffset(Math.max(0, offset - limit))}
          >
            {strings.operator.paginationPrevious}
          </Button>
          <span className="text-xs text-ink-muted">
            {strings.operator.paginationPageOf
              .replace('{page}', String(currentPage(offset, limit)))
              .replace('{pages}', String(pages))}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={offset + limit >= data.total}
            onClick={() => setRequestedOffset(offset + limit)}
          >
            {strings.operator.paginationNext}
          </Button>
        </div>
        {page.error !== undefined ? (
          <p className="mt-3 text-xs text-ink-muted" role="alert">
            {page.error}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <article>
      <PageHeader title={strings.prospects.title} description={strings.prospects.description} />

      <div className="mb-4">
        <SegmentedControl
          value={filters.queue}
          onValueChange={(queue) => applyFilters({ ...filters, queue: queue as ProspectQueue })}
          options={queueOptions}
          ariaLabel={strings.prospects.queueLabel}
        />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-44">
            <Select
              value={filters.identityStatus}
              onChange={(event) => {
                const next = event.target.value;
                if (isIdentityStatusValue(next)) {
                  applyFilters({ ...filters, identityStatus: next });
                }
              }}
              aria-label={strings.prospects.filters.identityStatus}
            >
              <option value="">{strings.prospects.filters.all}</option>
              {IDENTITY_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {vocabularyLabel(strings.labels.identity, value)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={filters.groupStatus}
              onChange={(event) => {
                const next = event.target.value;
                if (isGroupStatusValue(next)) {
                  applyFilters({ ...filters, groupStatus: next });
                }
              }}
              aria-label={strings.prospects.filters.groupStatus}
            >
              <option value="">{strings.prospects.filters.all}</option>
              {GROUP_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {vocabularyLabel(strings.labels.group, value)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={filters.reviewState}
              onChange={(event) => {
                const next = event.target.value;
                if (isReviewStateValue(next)) {
                  applyFilters({ ...filters, reviewState: next });
                }
              }}
              aria-label={strings.prospects.filters.reviewState}
            >
              <option value="">{strings.prospects.filters.all}</option>
              {REVIEW_STATE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {vocabularyLabel(strings.labels.review, value)}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={filters.qualificationOutcome}
              onChange={(event) => {
                const next = event.target.value;
                if (isQualificationValue(next)) {
                  applyFilters({ ...filters, qualificationOutcome: next });
                }
              }}
              aria-label={strings.prospects.filters.qualification}
            >
              <option value="">{strings.prospects.filters.all}</option>
              {QUALIFICATION_VALUES.map((value) => (
                <option key={value} value={value}>
                  {vocabularyLabel(strings.labels.qualification, value)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {body}
    </article>
  );
}
