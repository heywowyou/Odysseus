import type { JSX } from 'react';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
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
import { formatFailureRate, useInsightView, vendorRows } from './insights-model';
import type { VendorAggregateResponse } from './insights-model';

export function VendorsPage(): JSX.Element {
  const { strings, language } = useI18n();
  const { data, error, refresh } = useInsightView<VendorAggregateResponse>('/api/vendors');

  let body: JSX.Element;
  if (error !== undefined && data === undefined) {
    body = (
      <EmptyState
        title={strings.common.error}
        description={error}
        action={
          <Button variant="secondary" onClick={refresh}>
            {strings.common.retry}
          </Button>
        }
      />
    );
  } else if (data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  } else {
    const rows = vendorRows(data);
    body =
      rows.length === 0 ? (
        <EmptyState title={strings.vendors.empty} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <Table>
            <TableHead>
              <TableRow>
                {/* The kind column speaks in raw vocabulary keys; it has no
                  header copy, the same pattern as the audits row chevron. */}
                <TableHeaderCell className="w-36">{null}</TableHeaderCell>
                <TableHeaderCell>{strings.vendors.columns.vendor}</TableHeaderCell>
                <TableHeaderCell className="w-28 text-right">
                  {strings.vendors.columns.candidates}
                </TableHeaderCell>
                <TableHeaderCell className="w-28 text-right">
                  {strings.vendors.columns.failures}
                </TableHeaderCell>
                <TableHeaderCell className="w-28 text-right">
                  {strings.vendors.columns.failureRate}
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.kind}-${row.value}`}>
                  <TableCell>
                    <Badge tone={row.kind === 'failure-rule' ? 'serious' : 'neutral'}>
                      {row.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-ink">{row.value}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.candidates}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.failures ?? '-'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.failureRate === null ? '-' : formatFailureRate(row.failureRate, language)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
  }

  return (
    <article>
      <PageHeader title={strings.vendors.title} description={strings.vendors.description} />
      {body}
    </article>
  );
}
