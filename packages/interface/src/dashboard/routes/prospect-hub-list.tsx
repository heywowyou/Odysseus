import { useState } from 'react';
import type { JSX } from 'react';
import { Building2, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader, PAGE_WIDTH } from '../components/page-header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
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
import {
  buildHubProspectsPath,
  type ProspectHubListResponse,
  type ProspectHubRow,
} from './prospect-hub-model';

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

export function ProspectHubListPage(): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.prospectHub.list;
  const detailCopy = strings.prospectHub.detail;
  const [newProspectOpen, setNewProspectOpen] = useState(false);
  const [newProspect, setNewProspect] = useState({
    name: '',
    sector: 'hotel',
    website: '',
    email: '',
  });
  const [creating, setCreating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const sector = searchParams.get('sector') ?? '';
  const stars = searchParams.get('stars') ?? '';
  const groupStatus = searchParams.get('groupStatus') ?? '';
  const websiteKind = searchParams.get('websiteKind') ?? '';
  const department = searchParams.get('department') ?? '';
  const roomsMin = searchParams.get('roomsMin') ?? '';
  const roomsMax = searchParams.get('roomsMax') ?? '';
  const hasScan = searchParams.get('hasScan') ?? '';
  const inactive = searchParams.get('inactive') ?? '';
  const parsedPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const updateFilter = (key: string, value: string): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value.trim()) next.set(key, value.trim());
        else next.delete(key);
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  };
  const setPage = (nextPage: number): void => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('page', String(Math.max(1, nextPage)));
        return next;
      },
      { replace: true },
    );
  };
  const response = useApi<ProspectHubListResponse>(
    buildHubProspectsPath({
      q,
      status,
      sector,
      stars,
      groupStatus,
      websiteKind,
      department,
      roomsMin,
      roomsMax,
      hasScan,
      inactive,
      page,
    }),
  );
  const rows = response.data?.rows ?? [];
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
  return (
    <main className={`${PAGE_WIDTH.surface} px-5 py-8`}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setNewProspectOpen((open) => !open)}>
              {copy.newAction}
            </Button>
            <Link to="/annuaire">
              <Button>{copy.addFromDirectory}</Button>
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
      <Card className="mb-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              value={q}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchAria}
            />
          </label>
          <Input
            value={sector}
            onChange={(event) => updateFilter('sector', event.target.value)}
            placeholder={copy.sectorPlaceholder}
            aria-label={copy.sectorFilterAria}
          />
          <Select
            value={status}
            onChange={(event) => updateFilter('status', event.target.value)}
            aria-label={copy.statusFilterAria}
          >
            <option value="">{copy.allStatuses}</option>
            {STATUS_OPTIONS.slice(1).map((value) => (
              <option key={value} value={value}>
                {detailCopy.statusLabels[value] ?? strings.common.vocabularyFallback}
              </option>
            ))}
          </Select>
          <Select
            value={stars}
            onChange={(event) => updateFilter('stars', event.target.value)}
            aria-label={copy.starsFilterAria}
          >
            <option value="">{copy.allStars}</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {copy.starOption.replace('{count}', String(value))}
              </option>
            ))}
          </Select>
          <Select
            value={groupStatus}
            onChange={(event) => updateFilter('groupStatus', event.target.value)}
            aria-label={copy.groupFilterAria}
          >
            <option value="">{copy.allGroups}</option>
            {Object.entries(strings.prospectHub.directory.groupLabels).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
          <Select
            value={websiteKind}
            onChange={(event) => updateFilter('websiteKind', event.target.value)}
            aria-label={copy.websiteFilterAria}
          >
            <option value="">{copy.allWebsiteKinds}</option>
            {Object.entries(strings.prospectHub.directory.websiteKindLabels).map(
              ([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ),
            )}
          </Select>
          <Input
            value={department}
            onChange={(event) => updateFilter('department', event.target.value)}
            placeholder={copy.departmentPlaceholder}
            aria-label={copy.departmentAria}
          />
          <Input
            type="number"
            min="0"
            value={roomsMin}
            onChange={(event) => updateFilter('roomsMin', event.target.value)}
            placeholder={copy.roomsMinPlaceholder}
            aria-label={copy.roomsMinAria}
          />
          <Input
            type="number"
            min="0"
            value={roomsMax}
            onChange={(event) => updateFilter('roomsMax', event.target.value)}
            placeholder={copy.roomsMaxPlaceholder}
            aria-label={copy.roomsMaxAria}
          />
          <Select
            value={hasScan}
            onChange={(event) => updateFilter('hasScan', event.target.value)}
            aria-label={copy.scanFilterAria}
          >
            <option value="">{copy.allScans}</option>
            <option value="true">{copy.withScan}</option>
            <option value="false">{copy.withoutScan}</option>
          </Select>
          <Select
            value={inactive}
            onChange={(event) => updateFilter('inactive', event.target.value)}
            aria-label={copy.activityFilterAria}
          >
            <option value="">{copy.allActivity}</option>
            <option value="false">{copy.activeOnly}</option>
            <option value="true">{copy.inactiveOnly}</option>
          </Select>
        </div>
      </Card>
      {response.error ? (
        <EmptyState icon={Building2} title={copy.errorTitle} description={response.error} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          action={
            <Link to="/annuaire">
              <Button>{copy.openDirectory}</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{copy.columns.name}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.site}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.location}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.status}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.activity}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row: ProspectHubRow) => (
                <TableRow key={row.prospectId}>
                  <TableCell>
                    <Link
                      className="font-medium text-ink hover:underline"
                      to={`/prospects/${row.prospectId}`}
                    >
                      {row.name}
                    </Link>
                    <div className="text-xs text-ink-muted">{row.sector}</div>
                  </TableCell>
                  <TableCell>
                    {strings.prospectHub.directory.websiteKindLabels[
                      row.websites[0]?.kind ?? 'unknown'
                    ] ?? copy.unknown}
                  </TableCell>
                  <TableCell>
                    {[row.commune, row.department].filter(Boolean).join(' · ') || copy.notProvided}
                  </TableCell>
                  <TableCell>{detailCopy.statusLabels[row.status] ?? row.status}</TableCell>
                  <TableCell>{new Date(row.lastActivityAt).toLocaleDateString()}</TableCell>
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
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {copy.previous}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={rows.length < 50}
                onClick={() => setPage(page + 1)}
              >
                {copy.next}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </main>
  );
}
