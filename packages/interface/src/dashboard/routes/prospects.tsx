import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Building2, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { InfoTip } from '../components/ui/info-tip';
import { Input } from '../components/ui/input';
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
import { useDebouncedValue } from '../lib/use-debounced-value';
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
/** Settling time for the search box: the list refetches from the server on
 *  every change, so keystrokes must batch into one request per pause. */
const SEARCH_DEBOUNCE_MS = 300;

function reviewLabel(reviewState: string, strings: DashboardStrings): string {
  return vocabularyLabel(strings.labels.review, reviewState, strings.common.vocabularyFallback);
}

function detailTarget(row: ProspectRow): string {
  return `/prospects/${encodeURIComponent(row.candidateId)}`;
}

/** Header cell whose column name carries an inline info tip, for columns
 *  whose meaning one line of copy can settle (how the score, the
 *  qualification outcome, or the review state are produced). */
function HeaderWithTip(props: {
  label: string;
  hint: string;
  className?: string | undefined;
}): JSX.Element {
  return (
    <TableHeaderCell className={props.className ?? ''}>
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
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  // The settled search value joins the filter state the same way a Select
  // change does, through the same applyFilters semantics: a new value resets
  // the offset, and an unchanged one (the mount run) is a no-op.
  useEffect(() => {
    setFilters((current) => {
      if (current.search === debouncedSearch) return current;
      return { ...current, search: debouncedSearch };
    });
    setRequestedOffset(0);
  }, [debouncedSearch]);

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
          <p className="text-sm text-danger">{strings.common.requestFailed}</p>
          <p className="text-xs text-ink-muted">{page.error}</p>
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
                <TableHeaderCell className="w-44">{strings.prospects.columns.city}</TableHeaderCell>
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
                <HeaderWithTip
                  label={strings.labels.scoreSide.brokenness}
                  hint={strings.hints.score}
                  className="w-28 text-right"
                />
                <TableHeaderCell className="w-28 text-right">
                  {strings.labels.scoreSide.ability}
                </TableHeaderCell>
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
                  <TableCell className="whitespace-nowrap">{locationLabel(row)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.identity,
                      row.identityStatus,
                      strings.common.vocabularyFallback,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.group,
                      row.groupStatus,
                      strings.common.vocabularyFallback,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge tone={qualificationBadgeTone(row.qualificationOutcome)}>
                      {vocabularyLabel(
                        strings.labels.qualification,
                        row.qualificationOutcome,
                        strings.common.vocabularyFallback,
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge tone={reviewBadgeTone(row.reviewState)}>
                      {reviewLabel(row.reviewState, strings)}
                    </Badge>
                  </TableCell>
                  <TableCell className="numeric text-right text-ink">
                    {row.brokennessTotal ?? '-'}
                  </TableCell>
                  <TableCell className="numeric text-right text-ink">
                    {row.abilityTotal ?? '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.contact,
                      row.contactState,
                      strings.common.vocabularyFallback,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.thread,
                      row.threadState,
                      strings.common.vocabularyFallback,
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.outcome,
                      row.outcome,
                      strings.common.vocabularyFallback,
                    )}
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
          <div className="mt-3 text-xs text-ink-muted" role="alert">
            <p>{strings.common.requestFailed}</p>
            <p>{page.error}</p>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <article className={PAGE_WIDTH.surface}>
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
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={strings.prospects.searchPlaceholder}
            aria-label={strings.prospects.searchPlaceholder}
            className="min-w-40 flex-1"
          />
          <div className="w-44">
            <Field
              label={strings.prospects.filters.identityStatus}
              htmlFor="prospects-filter-identity-status"
            >
              <Select
                id="prospects-filter-identity-status"
                value={filters.identityStatus}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isIdentityStatusValue(next)) {
                    applyFilters({ ...filters, identityStatus: next });
                  }
                }}
              >
                <option value="">{strings.prospects.filters.all}</option>
                {IDENTITY_STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {vocabularyLabel(
                      strings.labels.identity,
                      value,
                      strings.common.vocabularyFallback,
                    )}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-44">
            <Field
              label={strings.prospects.filters.groupStatus}
              htmlFor="prospects-filter-group-status"
            >
              <Select
                id="prospects-filter-group-status"
                value={filters.groupStatus}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isGroupStatusValue(next)) {
                    applyFilters({ ...filters, groupStatus: next });
                  }
                }}
              >
                <option value="">{strings.prospects.filters.all}</option>
                {GROUP_STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {vocabularyLabel(
                      strings.labels.group,
                      value,
                      strings.common.vocabularyFallback,
                    )}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-44">
            <Field
              label={strings.prospects.filters.reviewState}
              htmlFor="prospects-filter-review-state"
            >
              <Select
                id="prospects-filter-review-state"
                value={filters.reviewState}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isReviewStateValue(next)) {
                    applyFilters({ ...filters, reviewState: next });
                  }
                }}
              >
                <option value="">{strings.prospects.filters.all}</option>
                {REVIEW_STATE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {vocabularyLabel(
                      strings.labels.review,
                      value,
                      strings.common.vocabularyFallback,
                    )}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-44">
            <Field
              label={strings.prospects.filters.qualification}
              htmlFor="prospects-filter-qualification"
            >
              <Select
                id="prospects-filter-qualification"
                value={filters.qualificationOutcome}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isQualificationValue(next)) {
                    applyFilters({ ...filters, qualificationOutcome: next });
                  }
                }}
              >
                <option value="">{strings.prospects.filters.all}</option>
                {QUALIFICATION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {vocabularyLabel(
                      strings.labels.qualification,
                      value,
                      strings.common.vocabularyFallback,
                    )}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      {body}
    </article>
  );
}
