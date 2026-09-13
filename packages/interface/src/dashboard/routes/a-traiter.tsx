import { useState } from 'react';
import type { JSX } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
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
import { fetchJson, sendJson } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import type { TodoPage, TodoRow, TodoRowKind } from '../lib/api-types';

// Plan 040 poll policy: lists refresh every 10s (usePolling also pauses
// every poll while the tab is hidden).
const POLL_INTERVAL_MS = 10_000;
const SKELETON_ROW_COUNT = 6;

const DEFAULT_BATCH_LIMIT = 10;

/** One "start a batch job" row: a bounded limit input plus a button, per the
 *  plan's choice not to build a dedicated progress page for these jobs. A
 *  toast on enqueue is enough; the job's own drafts show up in the table
 *  below once it finishes. Starting a batch creates review-only drafts and
 *  sends nothing (trade-offs 82 and 83), so no confirmation dialog. */
function BatchRow(props: { label: string; buttonLabel: string; path: string }): JSX.Element {
  const { strings } = useI18n();
  const [limit, setLimit] = useState(DEFAULT_BATCH_LIMIT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStart = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await sendJson<{ jobId: string }>(props.path, 'POST', { limit });
      toast.success(strings.aTraiter.batch.started);
    } catch {
      toast.error(strings.aTraiter.batch.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{props.label}</p>
      </div>
      <Field label={strings.aTraiter.batch.limitLabel} htmlFor={`${props.path}-limit`}>
        <Input
          id={`${props.path}-limit`}
          type="number"
          min={1}
          value={limit}
          onChange={(event) => setLimit(Math.max(1, Number(event.target.value) || 1))}
          className="w-20"
        />
      </Field>
      <Button onClick={() => void handleStart()} disabled={isSubmitting}>
        {props.buttonLabel}
      </Button>
    </div>
  );
}

const KIND_TONE: Record<TodoRowKind, BadgeTone> = {
  draft: 'neutral',
  reply: 'accent',
  hotel: 'neutral',
  audit: 'accent',
};

/** The dashboard's landing page and the operator's inbox (plan 045 stage
 *  3.3): the two batch buttons, then one merged table over GET /api/todo.
 *  Every row names one concrete action on one subject and opens straight
 *  into the hotel hub or the audit. */
export function ATraiterPage(): JSX.Element {
  const { strings } = useI18n();
  const navigate = useNavigate();
  const { data, error, refresh } = usePolling(
    () => fetchJson<TodoPage>('/api/todo'),
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
                  {row.since !== null
                    ? formatRelativeTime(row.since, strings.common.relativeTime)
                    : strings.common.valueUnavailable}
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
      <Card className="mb-5 flex flex-col gap-4">
        <BatchRow
          label={strings.aTraiter.batch.draftBatchLabel}
          buttonLabel={strings.aTraiter.batch.draftBatchButton}
          path="/api/outreach/draft-batch"
        />
        <BatchRow
          label={strings.aTraiter.batch.followUpBatchLabel}
          buttonLabel={strings.aTraiter.batch.followUpBatchButton}
          path="/api/outreach/followup-batch"
        />
      </Card>
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
