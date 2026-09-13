import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
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
import { useApi } from '../lib/use-api';
import { formatDateTime } from '../lib/format';
import { useDebouncedValue } from '../lib/use-debounced-value';
import { usePolling } from '../lib/use-polling';
import { vocabularyLabel } from '../lib/vocabulary';
import {
  WaveDialog,
  mutateWaveRoster,
  waveRefusalSentence,
  waveScoringSentence,
} from './wave-dialog';
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
  selectionBadgeTone,
  selectionCountLine,
  totalPages,
} from './prospects-model';
import type {
  ProspectFilterState,
  ProspectListResponse,
  ProspectQueue,
  ProspectRow,
  SelectionFilter,
  SelectionOverviewResponse,
} from './prospects-model';

// Plan 040 poll policy: lists refresh every 10s (usePolling also pauses
// every poll while the tab is hidden).
const POLL_INTERVAL_MS = 10_000;
const SKELETON_ROW_COUNT = 8;
/** Settling time for the search box: the list refetches from the server on
 *  every change, so keystrokes must batch into one request per pause. */
const SEARCH_DEBOUNCE_MS = 300;

function reviewLabel(reviewState: string, strings: DashboardStrings): string {
  return vocabularyLabel(strings.labels.review, reviewState, strings.common.vocabularyFallback);
}

/** The wave column's cell text (plan 041 slice B1): membership only, never
 *  "can be scanned now" - the hub carries the full typed verdict. */
function selectionLabel(row: ProspectRow, strings: DashboardStrings): string {
  if (!row.inSelection) return strings.prospects.selectionValues.notInSelection;
  return row.selectionRank === null
    ? strings.prospects.selectionValues.inSelectionNoRank
    : strings.prospects.selectionValues.inSelectionWithRank.replace(
        '{rank}',
        String(row.selectionRank),
      );
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
  const { strings, language } = useI18n();
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
    (signal) =>
      fetchJson<ProspectListResponse>(buildProspectsPath(filters, requestedOffset), { signal }),
    POLL_INTERVAL_MS,
    // The path is the poll key: a filter or page change resets state and
    // refetches, an unrelated re-render never does.
    { key: buildProspectsPath(filters, requestedOffset) },
  );
  const data = page.data;

  // Plan 043 slice 3: the wave add for one row, and the read-only
  // selection overview. Both use the same routes the hub uses; the
  // overview only fetches while open.
  const [waveRow, setWaveRow] = useState<ProspectRow | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const overview = useApi<SelectionOverviewResponse>(isOverviewOpen ? '/api/selection' : null);

  const submitWave = async (row: ProspectRow, wave: string): Promise<void> => {
    try {
      const { refusal, scoring } = await mutateWaveRoster(row.candidateId, wave, 'add');
      if (refusal !== undefined) {
        toast.error(waveRefusalSentence(refusal, strings) ?? strings.operator.actionError);
        return;
      }
      toast.success(strings.hub.wave.addedToast.replace('{wave}', wave), {
        description: waveScoringSentence(scoring, strings),
      });
      page.refresh();
    } catch (caught) {
      toast.error(strings.operator.actionError, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    }
  };

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

  const selectionOptions = useMemo(
    () => [
      { value: 'selected' as const, label: strings.prospects.selectionFilter.selected },
      { value: 'all' as const, label: strings.prospects.selectionFilter.all },
    ],
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
                <TableHeaderCell>{strings.prospects.columns.selection}</TableHeaderCell>
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
                <TableHeaderCell className="w-10">
                  <span className="sr-only">{strings.prospects.columns.actions}</span>
                </TableHeaderCell>
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
                  <TableCell className="whitespace-nowrap">
                    <Badge tone={selectionBadgeTone(row.inSelection)}>
                      {selectionLabel(row, strings)}
                    </Badge>
                    {!row.inSelection ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="ml-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          setWaveRow(row);
                        }}
                      >
                        {strings.prospects.addRowAction}
                      </Button>
                    ) : null}
                  </TableCell>
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
                    {/* Issue #199: a selected row without a score says so,
                        instead of a dash that reads as "no problems". */}
                    {row.brokennessTotal ??
                      (row.inSelection ? strings.prospects.notScoredCell : '-')}
                  </TableCell>
                  <TableCell className="numeric text-right text-ink">
                    {row.abilityTotal ?? (row.inSelection ? strings.prospects.notScoredCell : '-')}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.contact,
                      row.contactState,
                      strings.common.vocabularyFallback,
                    ) || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.thread,
                      row.threadState,
                      strings.common.vocabularyFallback,
                    ) || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-ink-soft">
                    {vocabularyLabel(
                      strings.labels.outcome,
                      row.outcome,
                      strings.common.vocabularyFallback,
                    ) || '-'}
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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={filters.selection}
          onValueChange={(selection) =>
            applyFilters({ ...filters, selection: selection as SelectionFilter })
          }
          options={selectionOptions}
          ariaLabel={strings.prospects.selectionFilter.label}
        />
        {data !== undefined ? (
          <span className="text-xs text-ink-muted">
            {selectionCountLine(strings, data.selection, data.selectedCount, data.catalogueTotal)}
          </span>
        ) : null}
      </div>

      {/* Plan 043 slice 3: the selection record, read-only. The cohorts are
          the formula's insert-only documents; the roster is the operator's
          own ledger. Nothing here mutates. */}
      <div className="mb-4">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={isOverviewOpen}
          onClick={() => setIsOverviewOpen(!isOverviewOpen)}
        >
          {isOverviewOpen
            ? strings.prospects.selectionOverview.hide
            : strings.prospects.selectionOverview.show}
        </Button>
        {isOverviewOpen ? (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="text-sm font-semibold text-ink">
                {strings.prospects.selectionOverview.cohortsTitle}
              </h2>
              {overview.data === undefined ? (
                <p className="mt-2 text-sm text-ink-muted">{strings.common.loading}</p>
              ) : overview.data.cohorts.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">
                  {strings.prospects.selectionOverview.cohortsEmpty}
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.version}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.kind}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.date}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.population}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.selected}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.cutoffs}
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overview.data.cohorts.map((cohort) => (
                        <TableRow key={cohort.cohortId}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {cohort.scoringVersion}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {cohort.approved
                              ? strings.prospects.selectionOverview.kind.selected
                              : strings.prospects.selectionOverview.kind.calibration}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(cohort.computedAt, language)}
                          </TableCell>
                          <TableCell className="numeric text-xs">{cohort.populationSize}</TableCell>
                          <TableCell className="numeric text-xs">{cohort.selectedCount}</TableCell>
                          <TableCell className="numeric text-xs">
                            {cohort.abilityCutoff ?? '-'} / {cohort.brokennessCutoff ?? '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
            <Card>
              <h2 className="text-sm font-semibold text-ink">
                {strings.prospects.selectionOverview.rosterTitle}
              </h2>
              {overview.data === undefined ? (
                <p className="mt-2 text-sm text-ink-muted">{strings.common.loading}</p>
              ) : overview.data.roster.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">
                  {strings.prospects.selectionOverview.rosterEmpty}
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.wave}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.hotel}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.actor}
                        </TableHeaderCell>
                        <TableHeaderCell>
                          {strings.prospects.selectionOverview.columns.date}
                        </TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overview.data.roster.map((entry) => (
                        <TableRow key={entry.entryId}>
                          <TableCell className="whitespace-nowrap text-xs">{entry.wave}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {entry.domain}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{entry.actor}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(entry.decidedAt, language)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </div>
        ) : null}
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
      <WaveDialog
        open={waveRow !== null}
        onOpenChange={(open) => {
          if (!open) setWaveRow(null);
        }}
        mode="add"
        candidateId={waveRow?.candidateId ?? null}
        hotelName={waveRow?.name ?? null}
        onSubmit={(candidateId, wave) => {
          const row = waveRow;
          if (row === null) return Promise.resolve();
          return submitWave(row, wave);
        }}
      />
    </article>
  );
}
