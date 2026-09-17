import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Building2 } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { PageHeader, PAGE_WIDTH } from '../components/page-header';
import { Button, buttonStyles } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { SegmentedControl } from '../components/ui/segmented';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { sendJson } from '../lib/api';
import { useApi } from '../lib/use-api';
import { useI18n } from '../i18n/provider';
import { formatCommune, formatDate, formatSector } from '../lib/format';
import {
  buildHubProspectsPath,
  PROSPECT_RESULT_STATUSES,
  type ProspectHubListResponse,
  type ProspectHubRow,
} from './prospect-hub-model';
import { ProspectFilterBar } from './prospect-filter-bar';
import { QueueScansDialog } from './queue-scans-dialog';
import {
  clearProspectFilters,
  parseProspectFilters,
  setProspectPage,
  setProspectView,
  updateProspectFilter,
} from './prospect-filter-model';

const STATUS_OPTIONS = [
  '',
  'new',
  'audited',
  'contacted',
  'follow-up',
  'replied',
  'call',
  'quoted',
  'won',
  'lost',
  'opted-out',
];

const OUTCOMES = [
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'opt-out',
  'call',
  'quoted',
  'won',
  'lost',
] as const;

export function ProspectHubListPage(): JSX.Element {
  const { strings, language } = useI18n();
  const copy = strings.prospectHub.list;
  const resultsCopy = strings.prospectHub.results;
  const detailCopy = strings.prospectHub.detail;
  const [newProspectOpen, setNewProspectOpen] = useState(false);
  const [newProspect, setNewProspect] = useState({
    name: '',
    sector: 'hotel',
    website: '',
    email: '',
  });
  const [creating, setCreating] = useState(false);
  // Issue #375: prospects picked for a batch scan, kept in the order they
  // were ticked, which is the order the review dialog proposes.
  const [selected, setSelected] = useState<ProspectHubRow[]>([]);
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  // What the dialog reviews, captured when it opens: clearing the selection
  // after a successful submission must not empty the result it is showing.
  const [queueProspects, setQueueProspects] = useState<ProspectHubRow[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const filterState = parseProspectFilters(searchParams);
  const resultsView = filterState.view === 'results';
  const archivedView = filterState.view === 'archived';
  const updateFilter = (key: Parameters<typeof updateProspectFilter>[1], value: string): void => {
    setSearchParams((current) => updateProspectFilter(current, key, value), { replace: true });
  };
  const setPage = (nextPage: number): void => {
    setSearchParams((current) => setProspectPage(current, nextPage), { replace: true });
  };
  const setView = (nextView: 'all' | 'results' | 'archived'): void => {
    setSearchParams((current) => setProspectView(current, nextView), { replace: true });
  };
  const response = useApi<ProspectHubListResponse>(buildHubProspectsPath(filterState));
  const rows = response.data?.rows ?? [];
  const selectedIds = useMemo(() => new Set(selected.map((row) => row.prospectId)), [selected]);
  const pageFullySelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.prospectId));
  const toggleRow = (row: ProspectHubRow): void =>
    setSelected((current) =>
      current.some((entry) => entry.prospectId === row.prospectId)
        ? current.filter((entry) => entry.prospectId !== row.prospectId)
        : [...current, row],
    );
  const togglePage = (): void =>
    setSelected((current) =>
      pageFullySelected
        ? current.filter((entry) => !rows.some((row) => row.prospectId === entry.prospectId))
        : [...current, ...rows.filter((row) => !selectedIds.has(row.prospectId))],
    );
  const canSelect = !resultsView && !archivedView;
  const pageCopy = resultsView ? resultsCopy : copy;
  const returnTo = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const detailHref = (prospectId: string): string =>
    `/prospects/${encodeURIComponent(prospectId)}?returnTo=${encodeURIComponent(returnTo)}`;
  const create = async (): Promise<void> => {
    if (!newProspect.name.trim()) return;
    setCreating(true);
    try {
      const websites = newProspect.website.trim()
        ? [
            {
              url: newProspect.website.trim(),
              registrableDomain: 'pending',
              kind: 'unknown',
              primary: true,
            },
          ]
        : [];
      const emails = newProspect.email.trim()
        ? [{ address: newProspect.email.trim(), origin: 'operator' }]
        : [];
      const created = await sendJson<{ prospectId: string }>('/api/prospects', 'POST', {
        name: newProspect.name.trim(),
        sector: newProspect.sector.trim() || 'other',
        websites,
        emails,
      });
      setNewProspect({ name: '', sector: 'hotel', website: '', email: '' });
      setNewProspectOpen(false);
      window.location.assign(`/prospects/${encodeURIComponent(created.prospectId)}`);
    } finally {
      setCreating(false);
    }
  };
  const recordOutcome = async (row: ProspectHubRow, outcome: string): Promise<void> => {
    await sendJson(`/api/prospects/${encodeURIComponent(row.prospectId)}/outcome`, 'POST', {
      outcome,
    });
    response.refresh();
  };
  return (
    <div className={`${PAGE_WIDTH.surface} px-5 py-8`}>
      <PageHeader
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
        description={pageCopy.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setNewProspectOpen((open) => !open)}>
              {copy.newAction}
            </Button>
            <Link to="/annuaire" className={buttonStyles()}>
              {copy.addFromDirectory}
            </Link>
          </div>
        }
      />
      {newProspectOpen ? (
        <Card className="mb-5" title={copy.newTitle}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={newProspect.name}
              onChange={(event) =>
                setNewProspect((current) => ({ ...current, name: event.target.value }))
              }
              placeholder={copy.namePlaceholder}
              aria-label={copy.nameAria}
            />
            <Input
              value={newProspect.sector}
              onChange={(event) =>
                setNewProspect((current) => ({ ...current, sector: event.target.value }))
              }
              placeholder={copy.sectorPlaceholder}
              aria-label={copy.sectorAria}
            />
            <Input
              value={newProspect.website}
              onChange={(event) =>
                setNewProspect((current) => ({ ...current, website: event.target.value }))
              }
              placeholder={copy.websitePlaceholder}
              aria-label={copy.websiteAria}
            />
            <Input
              value={newProspect.email}
              onChange={(event) =>
                setNewProspect((current) => ({ ...current, email: event.target.value }))
              }
              placeholder={copy.emailPlaceholder}
              aria-label={copy.emailAria}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              isLoading={creating}
              disabled={!newProspect.name.trim()}
              onClick={() => void create()}
            >
              {copy.createAction}
            </Button>
          </div>
        </Card>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={filterState.view}
          onValueChange={setView}
          options={[
            { value: 'all', label: copy.allView },
            { value: 'results', label: copy.resultsView },
            {
              value: 'archived',
              label:
                response.data?.archivedCount === undefined || archivedView
                  ? copy.archivedView
                  : `${copy.archivedView} (${response.data.archivedCount})`,
            },
          ]}
          ariaLabel={copy.viewAria}
        />
      </div>
      <ProspectFilterBar
        source="prospects"
        state={filterState}
        onChange={updateFilter}
        onClear={() =>
          setSearchParams((current) => clearProspectFilters(current), { replace: true })
        }
        statusOptions={(resultsView ? PROSPECT_RESULT_STATUSES : STATUS_OPTIONS.slice(1)).map(
          (value) => ({
            value,
            label:
              (resultsView ? resultsCopy.statusLabels : detailCopy.statusLabels)[value] ??
              strings.common.vocabularyFallback,
          }),
        )}
        allStatusesLabel={copy.allStatuses}
        statusAriaLabel={copy.statusFilterAria}
      />
      {resultsView ? (
        <Card className="mb-5" title={resultsCopy.title}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PROSPECT_RESULT_STATUSES.map((status) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2"
              >
                <span className="text-sm text-ink-soft">
                  {resultsCopy.statusLabels[status] ?? strings.common.vocabularyFallback}
                </span>
                <Badge tone="accent" className="numeric">
                  {response.data?.statusCounts?.[status] ?? 0}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {canSelect && selected.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised px-4 py-2.5">
          <span className="text-sm text-ink-soft">
            {strings.scanQueue.selectedCount.replace('{count}', String(selected.length))}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              {strings.scanQueue.clearSelection}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setQueueProspects(selected);
                setQueueDialogOpen(true);
              }}
            >
              {strings.scanQueue.queueAction}
            </Button>
          </div>
        </div>
      ) : null}
      <QueueScansDialog
        open={queueDialogOpen}
        onOpenChange={setQueueDialogOpen}
        prospects={queueProspects}
        onQueued={() => setSelected([])}
      />
      {response.error ? (
        <EmptyState
          icon={Building2}
          title={resultsView ? resultsCopy.errorTitle : copy.errorTitle}
          description={response.error}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={
            resultsView
              ? resultsCopy.emptyTitle
              : archivedView
                ? copy.archivedEmptyTitle
                : copy.emptyTitle
          }
          description={
            resultsView
              ? resultsCopy.emptyDescription
              : archivedView
                ? copy.archivedEmptyDescription
                : copy.emptyDescription
          }
          action={
            archivedView ? undefined : (
              <Link to="/annuaire" className={buttonStyles()}>
                {copy.openDirectory}
              </Link>
            )
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                {resultsView ? (
                  <>
                    <TableHeaderCell>{resultsCopy.columns.prospect}</TableHeaderCell>
                    <TableHeaderCell>{resultsCopy.columns.status}</TableHeaderCell>
                    <TableHeaderCell>{resultsCopy.columns.outcome}</TableHeaderCell>
                    <TableHeaderCell>{resultsCopy.columns.site}</TableHeaderCell>
                  </>
                ) : (
                  <>
                    {canSelect ? (
                      <TableHeaderCell className="w-10">
                        <input
                          type="checkbox"
                          className="size-4 accent-accent-bright"
                          checked={pageFullySelected}
                          onChange={togglePage}
                          aria-label={strings.scanQueue.selectPageAria}
                        />
                      </TableHeaderCell>
                    ) : null}
                    <TableHeaderCell>{copy.columns.name}</TableHeaderCell>
                    <TableHeaderCell>{copy.columns.site}</TableHeaderCell>
                    <TableHeaderCell>{copy.columns.location}</TableHeaderCell>
                    <TableHeaderCell>{copy.columns.status}</TableHeaderCell>
                    <TableHeaderCell>{copy.columns.activity}</TableHeaderCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row: ProspectHubRow) => (
                <TableRow key={row.prospectId}>
                  {resultsView ? (
                    <>
                      <TableCell>
                        <Link
                          className="font-medium text-ink hover:underline"
                          to={detailHref(row.prospectId)}
                        >
                          {row.name}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {formatSector(row.sector, strings.common.sectorLabels)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone="neutral">
                          {resultsCopy.statusLabels[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value=""
                          onChange={(event) => {
                            if (event.target.value) void recordOutcome(row, event.target.value);
                          }}
                          aria-label={resultsCopy.outcomeAria.replace('{name}', row.name)}
                        >
                          <option value="">{resultsCopy.outcomePlaceholder}</option>
                          {OUTCOMES.map((outcome) => (
                            <option key={outcome} value={outcome}>
                              {resultsCopy.outcomeLabels[outcome] ??
                                strings.common.vocabularyFallback}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        {row.websites[0]?.registrableDomain ?? resultsCopy.unknownSite}
                      </TableCell>
                    </>
                  ) : (
                    <>
                      {canSelect ? (
                        <TableCell>
                          <input
                            type="checkbox"
                            className="size-4 accent-accent-bright"
                            checked={selectedIds.has(row.prospectId)}
                            onChange={() => toggleRow(row)}
                            aria-label={strings.scanQueue.selectAria.replace('{name}', row.name)}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <Link
                          className="font-medium text-ink hover:underline"
                          to={detailHref(row.prospectId)}
                        >
                          {row.name}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {formatSector(row.sector, strings.common.sectorLabels)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {strings.prospectHub.directory.websiteKindLabels[
                          row.websites[0]?.kind ?? 'unknown'
                        ] ?? copy.unknown}
                      </TableCell>
                      <TableCell>
                        {[row.commune && formatCommune(row.commune), row.department]
                          .filter(Boolean)
                          .join(' · ') || copy.notProvided}
                      </TableCell>
                      <TableCell>{detailCopy.statusLabels[row.status] ?? row.status}</TableCell>
                      <TableCell>{formatDate(row.lastActivityAt, language)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <span>{copy.count.replace('{count}', String(response.data?.total ?? 0))}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={filterState.page <= 1}
                onClick={() => setPage(filterState.page - 1)}
              >
                {copy.previous}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  filterState.page * (response.data?.pageSize ?? 50) >= (response.data?.total ?? 0)
                }
                onClick={() => setPage(filterState.page + 1)}
              >
                {copy.next}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
