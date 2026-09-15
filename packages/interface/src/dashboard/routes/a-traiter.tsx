import type { JSX } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
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
import { fetchJson } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import type { TodoPage, TodoRow, TodoRowKind } from '../lib/api-types';

// Plan 040 poll policy: lists refresh every 10s (usePolling also pauses
// every poll while the tab is hidden).
const POLL_INTERVAL_MS = 10_000;
const SKELETON_ROW_COUNT = 6;

const KIND_TONE: Record<TodoRowKind, BadgeTone> = {
  draft: 'neutral',
  reply: 'accent',
  'follow-up': 'neutral',
  'first-email': 'accent',
  'audit-input': 'serious',
};

/** The dashboard's landing page and the operator's inbox: every row is derived
 * from a durable prospect and opens that prospect's actionable page. */
export function ATraiterPage(): JSX.Element {
  const { strings } = useI18n();
  const navigate = useNavigate();
  const { data, error, refresh } = usePolling(
    (signal) => fetchJson<TodoPage>('/api/prospect-hub/todo', { signal }),
    POLL_INTERVAL_MS,
    {
      key: 'a-traiter:todo',
    },
  );

  let body: JSX.Element;
  if (error !== undefined && data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-ink-muted">{strings.common.requestFailed}</p>
          <Button variant="secondary" onClick={refresh}>
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
    body = <EmptyState icon={CheckCircle2} title={strings.aTraiter.empty} />;
  } else {
    body = (
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{strings.aTraiter.table.subjectHeader}</TableHeaderCell>
              <TableHeaderCell>{strings.aTraiter.table.actionHeader}</TableHeaderCell>
              <TableHeaderCell className="w-40">
                {strings.aTraiter.table.sinceHeader}
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.rows.map((row: TodoRow) => (
              <TableRow key={`${row.kind}-${row.href}`} onClick={() => navigate(row.href)}>
                <TableCell>
                  <span className="mb-1 inline-block">
                    <Badge tone={KIND_TONE[row.kind]}>{strings.aTraiter.kinds[row.kind]}</Badge>
                  </span>
                  <Link
                    to={row.href}
                    className="block font-medium text-ink hover:text-accent-bright"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.subject}
                  </Link>
                </TableCell>
                <TableCell>{strings.aTraiter.actions[row.action]}</TableCell>
                <TableCell className="numeric whitespace-nowrap text-xs text-ink-muted">
                  {formatRelativeTime(row.since, strings.common.relativeTime)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <article className={PAGE_WIDTH.surface}>
      <PageHeader title={strings.aTraiter.title} description={strings.aTraiter.description} />
      <p
        className="mb-4 rounded-xl border border-line-strong bg-panel px-5 py-4 text-sm font-medium text-ink"
        role="note"
      >
        {strings.drafts.neverSendNote}
      </p>
      {error !== undefined && data !== undefined ? (
        <div className="mb-3 text-xs text-ink-muted" role="alert">
          <p>{strings.common.requestFailed}</p>
          <p>{error}</p>
        </div>
      ) : null}
      {body}
    </article>
  );
}
