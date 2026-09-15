import type { JSX } from 'react';
import { Link } from 'react-router';
import { PageHeader, PAGE_WIDTH } from '../components/page-header';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
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
import type { ProspectHubListResponse, ProspectHubRow, ProspectStatus } from './prospect-hub-model';

const STATUSES: ProspectStatus[] = [
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

export function ProspectHubResultsPage(): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.prospectHub.results;
  const response = useApi<ProspectHubListResponse>('/api/prospect-hub/results?page=1&pageSize=200');
  const rows = response.data?.rows ?? [];
  const updateStatus = async (row: ProspectHubRow, status: string): Promise<void> => {
    await sendJson(`/api/prospects/${encodeURIComponent(row.prospectId)}/status`, 'PATCH', {
      status,
    });
    response.refresh();
  };
  const recordOutcome = async (row: ProspectHubRow, outcome: string): Promise<void> => {
    await sendJson(`/api/prospects/${encodeURIComponent(row.prospectId)}/outcome`, 'POST', {
      outcome,
    });
    response.refresh();
  };
  return (
    <main className={`${PAGE_WIDTH.surface} px-5 py-8`}>
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      {response.error ? (
        <EmptyState title={copy.errorTitle} description={response.error} />
      ) : rows.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyDescription} />
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{copy.columns.prospect}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.status}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.outcome}</TableHeaderCell>
                <TableHeaderCell>{copy.columns.site}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.prospectId}>
                  <TableCell>
                    <Link
                      className="font-medium text-ink hover:underline"
                      to={`/prospects/${row.prospectId}`}
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={row.status}
                      onChange={(event) => void updateStatus(row, event.target.value)}
                      aria-label={copy.statusAria.replace('{name}', row.name)}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {copy.statusLabels[status] ?? strings.common.vocabularyFallback}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value=""
                      onChange={(event) => {
                        if (event.target.value) void recordOutcome(row, event.target.value);
                      }}
                      aria-label={copy.outcomeAria.replace('{name}', row.name)}
                    >
                      <option value="">{copy.outcomePlaceholder}</option>
                      {OUTCOMES.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {copy.outcomeLabels[outcome] ?? strings.common.vocabularyFallback}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>{row.websites[0]?.registrableDomain ?? copy.unknownSite}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}
