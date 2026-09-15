import { useState } from 'react';
import type { JSX } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
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
  buildDirectoryPath,
  type DirectoryResponse,
  type DirectoryRow,
} from './prospect-hub-model';

export function DirectoryPage(): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.prospectHub.directory;
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const sector = searchParams.get('sector') ?? '';
  const stars = searchParams.get('stars') ?? '';
  const groupStatus = searchParams.get('groupStatus') ?? '';
  const websiteKind = searchParams.get('websiteKind') ?? '';
  const department = searchParams.get('department') ?? '';
  const roomsMin = searchParams.get('roomsMin') ?? '';
  const roomsMax = searchParams.get('roomsMax') ?? '';
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
  const [selected, setSelected] = useState<string[]>([]);
  const response = useApi<DirectoryResponse>(
    buildDirectoryPath({
      q,
      sector,
      stars,
      groupStatus,
      websiteKind,
      department,
      roomsMin,
      roomsMax,
      page,
    }),
  );
  const rows = response.data?.rows ?? [];
  const toggle = (id: string): void =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  const add = async (): Promise<void> => {
    if (selected.length === 0) return;
    await sendJson('/api/directory/add', 'POST', { directoryIds: selected });
    setSelected([]);
    response.refresh();
  };
  return (
    <main className={`${PAGE_WIDTH.surface} px-5 py-8`}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <Link to="/prospects">
            <Button variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {copy.backToProspects}
            </Button>
          </Link>
        }
      />
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
            placeholder={strings.prospectHub.list.sectorPlaceholder}
            aria-label={copy.sectorAria}
          />
          <Select
            value={stars}
            onChange={(event) => updateFilter('stars', event.target.value)}
            aria-label={copy.starsAria}
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
            aria-label={copy.groupAria}
          >
            <option value="">{copy.allGroups}</option>
            {Object.entries(copy.groupLabels).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
          <Select
            value={websiteKind}
            onChange={(event) => updateFilter('websiteKind', event.target.value)}
            aria-label={copy.websiteAria}
          >
            <option value="">{copy.allWebsiteKinds}</option>
            {Object.entries(copy.websiteKindLabels).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
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
        </div>
      </Card>
      {response.error ? (
        <EmptyState title={copy.errorTitle} description={response.error} />
      ) : (
        <Card
          title={copy.count.replace('{count}', String(response.data?.total ?? 0))}
          actions={
            <Button disabled={selected.length === 0} onClick={() => void add()}>
              {copy.addSelected.replace('{count}', String(selected.length))}
            </Button>
          }
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>
                  <span className="sr-only">{copy.columns.select}</span>
                </TableHeaderCell>
                <TableHeaderCell>{copy.columns.name}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.site}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.location}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.property}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row: DirectoryRow) => (
                <TableRow key={row.directoryId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.includes(row.directoryId)}
                      disabled={row.prospectId !== undefined}
                      onChange={() => toggle(row.directoryId)}
                      aria-label={
                        row.prospectId ? copy.alreadyAdded : copy.addOne.replace('{name}', row.name)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {row.prospectId ? (
                      <Link
                        className="font-medium text-ink hover:underline"
                        to={`/prospects/${row.prospectId}`}
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{row.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {copy.websiteKindLabels[row.websiteKind] ?? strings.common.vocabularyFallback}
                    {row.registrableDomain ? (
                      <div className="text-xs text-ink-muted">{row.registrableDomain}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {[row.commune, row.department, row.postcode].filter(Boolean).join(' · ') ||
                      copy.notProvided}
                  </TableCell>
                  <TableCell>
                    {[
                      row.stars ? copy.starOption.replace('{count}', String(row.stars)) : undefined,
                      row.rooms
                        ? copy.roomsOption.replace('{count}', String(row.rooms))
                        : undefined,
                      row.groupStatus
                        ? (copy.groupLabels[row.groupStatus] ?? strings.common.vocabularyFallback)
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ') || copy.noFacets}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end gap-2">
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
        </Card>
      )}
    </main>
  );
}
