import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
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
import { formatDateTime } from '../lib/format';
import { distinctBookingKinds, prescanRows, useInsightView } from './insights-model';
import type { PrescanResponse, PrescanStatus } from './insights-model';

const STATUS_TONES: Record<PrescanStatus, BadgeTone> = {
  complete: 'accent',
  'blocked-by-robots': 'serious',
  'homepage-unreachable': 'critical',
};

export function PrescanPage(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { strings, language } = useI18n();
  const path =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}/prescan`;
  const { data, error, refresh, isNotFound } = useInsightView<PrescanResponse>(path);

  let body: JSX.Element;
  if (isNotFound) {
    body = <EmptyState title={strings.prescan.empty} />;
  } else if (error !== undefined && data === undefined) {
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
          <Skeleton className="h-16 w-full" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  } else {
    const bookingKinds = distinctBookingKinds(data);
    body = (
      <>
        <Card className="mb-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">{strings.prescan.statusLabel}</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONES[data.status]}>{data.status}</Badge>
                <Badge tone="neutral">{data.prescanVersion}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{strings.prescan.scannedAtLabel}</dt>
              <dd className="mt-1 text-sm text-ink">{formatDateTime(data.startedAt, language)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">{strings.prescan.vendorLabel}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {bookingKinds.length === 0 ? (
                  <span className="text-sm text-ink-muted">-</span>
                ) : (
                  bookingKinds.map((kind) => (
                    <Badge key={kind} tone="neutral">
                      {kind}
                    </Badge>
                  ))
                )}
              </dd>
            </div>
          </dl>
        </Card>
        <Card title={strings.prescan.pagesHeading}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{strings.prescan.columns.role}</TableHeaderCell>
                <TableHeaderCell>{strings.prescan.columns.status}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {prescanRows(data).map((row) => (
                <TableRow key={row.role}>
                  <TableCell className="text-ink">{row.role}</TableCell>
                  {row.page !== null ? (
                    <TableCell className="tabular-nums">{row.page.httpStatus ?? '-'}</TableCell>
                  ) : (
                    <TableCell className="text-ink-muted">{row.reason}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </>
    );
  }

  return (
    <article>
      <PageHeader
        title={strings.prescan.title}
        description={strings.prescan.description}
        actions={
          candidateId !== undefined ? (
            <Link
              to={`/prospects/${encodeURIComponent(candidateId)}`}
              className={buttonStyles('secondary', 'sm')}
            >
              {strings.operator.backToProspects}
            </Link>
          ) : null
        }
      />
      {body}
    </article>
  );
}
