import { useState } from 'react';
import type { JSX } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader, PAGE_WIDTH } from '../components/page-header';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
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
import { ProspectFilterBar } from './prospect-filter-bar';
import {
  clearProspectFilters,
  parseProspectFilters,
  setProspectPage,
  updateProspectFilter,
} from './prospect-filter-model';

export function DirectoryPage(): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.prospectHub.directory;
  const [searchParams, setSearchParams] = useSearchParams();
  const filterState = parseProspectFilters(searchParams);
  const updateFilter = (key: Parameters<typeof updateProspectFilter>[1], value: string): void => {
    setSearchParams((current) => updateProspectFilter(current, key, value), { replace: true });
  };
  const setPage = (nextPage: number): void => {
    setSearchParams((current) => setProspectPage(current, nextPage), { replace: true });
  };
  const [selected, setSelected] = useState<string[]>([]);
  const response = useApi<DirectoryResponse>(buildDirectoryPath(filterState));
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
    <div className={`${PAGE_WIDTH.surface} px-5 py-8`}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={
          <Link to="/prospects" className={buttonStyles('secondary')}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.backToProspects}
          </Link>
        }
      />
      <ProspectFilterBar
        source="directory"
        state={filterState}
        onChange={updateFilter}
        onClear={() =>
          setSearchParams((current) => clearProspectFilters(current), { replace: true })
        }
      />
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
        </Card>
      )}
    </div>
  );
}
