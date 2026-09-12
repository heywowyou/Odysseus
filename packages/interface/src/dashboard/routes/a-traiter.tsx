import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { cn } from '../lib/cn';
import { fetchJson, sendJson } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import type { ScanSummary } from '../lib/api-types';
import { A_TRAITER_ROW_LIMIT, draftTouchName, needsInputScans } from './a-traiter-model';
import { hostnameOf } from './audits-model';
import type {
  OutreachDraftsPage,
  OutreachDraftRow,
  RepliesPage,
  ReplyReviewRow,
} from './outreach-model';
import { locationLabel } from './prospects-model';
import type { ProspectListResponse, ProspectRow } from './prospects-model';

// Plan 040 poll policy: lists refresh every 10s (usePolling also pauses
// every poll while the tab is hidden).
const POLL_INTERVAL_MS = 10_000;

const DEFAULT_BATCH_LIMIT = 10;

/** One "start a batch job" row: a bounded limit input plus a button, per the
 *  plan's choice not to build a dedicated progress page for these jobs. A
 *  toast on enqueue is enough; the job's own drafts show up in the lists
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

/** Settled render state of one short list; the four lists differ only in
 *  what their rows contain, never in their chrome. */
type QueueState =
  { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; total: number; rows: ReactNode[] };

/** Collapse a polled fetch into that state. A failed count renders as
 *  unavailable instead of silently disappearing, so unknown never reads as
 *  zero pending items; a list with a total but no rows is genuinely empty. */
function queueState(total: number | undefined, hasFailed: boolean, rows: ReactNode[]): QueueState {
  if (total !== undefined) return { kind: 'ready', total, rows };
  return hasFailed ? { kind: 'failed' } : { kind: 'loading' };
}

/** One short list into the hub: a heading carrying the queue's full total
 *  and at most A_TRAITER_ROW_LIMIT rows. An empty queue renders a muted
 *  one-liner rather than an empty-state block. */
function QueueSection(props: {
  heading: string;
  state: QueueState;
  emptyLine: string;
}): JSX.Element {
  const { strings } = useI18n();
  const { state } = props;
  return (
    <Card
      title={props.heading}
      actions={
        state.kind === 'loading' ? (
          <Skeleton className="h-5 w-10" />
        ) : state.kind === 'failed' ? (
          <Badge tone="neutral">{strings.common.valueUnavailable}</Badge>
        ) : (
          <Badge tone="neutral" className="numeric">
            {state.total}
          </Badge>
        )
      }
    >
      {state.kind === 'loading' ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : state.kind === 'failed' ? (
        <p className="text-sm text-ink-muted">{strings.common.requestFailed}</p>
      ) : state.rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{props.emptyLine}</p>
      ) : (
        <ul className="flex flex-col gap-2">{state.rows}</ul>
      )}
    </Card>
  );
}

/** One row of a short list. The whole row is the door into the hub (or the
 *  audit); the hotel's own name is the primary line, and only a candidate
 *  whose name is unknown degrades to its raw identifier. */
function QueueRow(props: {
  to: string;
  primary: string;
  primaryIdent: boolean;
  secondary: string;
}): JSX.Element {
  return (
    <li>
      <Link
        to={props.to}
        className="flex items-center gap-3 rounded-lg border border-line bg-raised px-3 py-2 transition-colors hover:border-line-strong"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium text-ink',
              props.primaryIdent && 'ident',
            )}
          >
            {props.primary}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">{props.secondary}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Primary line of a row naming a hotel: the catalogue name when the
 *  candidate still resolves, otherwise the raw identifier. */
function hotelPrimary(
  hotelName: string | null,
  candidateId: string,
): {
  primary: string;
  primaryIdent: boolean;
} {
  return hotelName !== null
    ? { primary: hotelName, primaryIdent: false }
    : { primary: candidateId, primaryIdent: true };
}

function DraftsQueue(): JSX.Element {
  const { strings } = useI18n();
  const { data, error } = usePolling(
    () => fetchJson<OutreachDraftsPage>(`/api/outreach/drafts?limit=${A_TRAITER_ROW_LIMIT}`),
    POLL_INTERVAL_MS,
    { key: 'a-traiter:drafts' },
  );
  const rows = (data?.rows ?? []).map((draft: OutreachDraftRow) => (
    <QueueRow
      key={draft.draftId}
      to={`/prospects/${encodeURIComponent(draft.candidateId)}#hub-emails`}
      {...hotelPrimary(draft.hotelName, draft.candidateId)}
      secondary={`${draftTouchName(draft.touch, strings.hub.emails)} · ${formatRelativeTime(
        draft.createdAt,
        strings.common.relativeTime,
      )}`}
    />
  ));
  return (
    <QueueSection
      heading={strings.aTraiter.lists.drafts}
      emptyLine={strings.aTraiter.empty.drafts}
      state={queueState(data?.total, error !== undefined, rows)}
    />
  );
}

function RepliesQueue(): JSX.Element {
  const { strings } = useI18n();
  const { data, error } = usePolling(
    () => fetchJson<RepliesPage>(`/api/outreach/replies?limit=${A_TRAITER_ROW_LIMIT}`),
    POLL_INTERVAL_MS,
    { key: 'a-traiter:replies' },
  );
  const rows = (data?.rows ?? []).map((reply: ReplyReviewRow) => (
    <QueueRow
      key={reply.threadId}
      to={`/prospects/${encodeURIComponent(reply.candidateId)}#hub-outcome`}
      {...hotelPrimary(reply.hotelName, reply.candidateId)}
      secondary={`${reply.domain} · ${reply.reviewReason} · ${formatRelativeTime(
        reply.reviewDetectedAt,
        strings.common.relativeTime,
      )}`}
    />
  ));
  return (
    <QueueSection
      heading={strings.aTraiter.lists.replies}
      emptyLine={strings.aTraiter.empty.replies}
      state={queueState(data?.total, error !== undefined, rows)}
    />
  );
}

function HotelsQueue(): JSX.Element {
  const { strings } = useI18n();
  const { data, error } = usePolling(
    () =>
      fetchJson<ProspectListResponse>(
        `/api/prospects?queue=join-review&limit=${A_TRAITER_ROW_LIMIT}`,
      ),
    POLL_INTERVAL_MS,
    { key: 'a-traiter:hotels' },
  );
  const rows = (data?.rows ?? []).map((prospect: ProspectRow) => (
    <QueueRow
      key={prospect.candidateId}
      to={`/prospects/${encodeURIComponent(prospect.candidateId)}`}
      primary={prospect.name}
      primaryIdent={false}
      secondary={locationLabel(prospect)}
    />
  ));
  return (
    <QueueSection
      heading={strings.aTraiter.lists.hotels}
      emptyLine={strings.aTraiter.empty.hotels}
      state={queueState(data?.total, error !== undefined, rows)}
    />
  );
}

/** Audits waiting for input are the needs-input rows of the same bounded
 *  window the Audits list reads; the endpoint serves an array without a
 *  total, so the header count is computed over that window. */
function AuditsQueue(): JSX.Element {
  const { strings } = useI18n();
  const { data, error } = usePolling(
    () => fetchJson<ScanSummary[]>('/api/scans?limit=200'),
    POLL_INTERVAL_MS,
    { key: 'a-traiter:audits' },
  );
  const waiting = data === undefined ? [] : needsInputScans(data);
  const rows = waiting
    .filter(
      (summary): summary is ScanSummary & { auditId: string } => summary.auditId !== undefined,
    )
    .slice(0, A_TRAITER_ROW_LIMIT)
    .map((summary) => (
      <QueueRow
        key={summary.jobId}
        to={`/audits/${encodeURIComponent(summary.auditId)}`}
        primary={
          summary.siteUrl !== undefined ? hostnameOf(summary.siteUrl) : strings.common.unknownSite
        }
        primaryIdent={false}
        secondary={`${summary.jobId} · ${formatRelativeTime(
          summary.createdAt,
          strings.common.relativeTime,
        )}`}
      />
    ));
  return (
    <QueueSection
      heading={strings.aTraiter.lists.audits}
      emptyLine={strings.aTraiter.empty.audits}
      state={queueState(data === undefined ? undefined : waiting.length, error !== undefined, rows)}
    />
  );
}

/** The dashboard's landing page and the operator's inbox (plan 040 slice 6,
 *  approved IA): the two batch buttons, then four short queues whose rows
 *  open the hotel hub or the audit. Everything reads existing endpoints. */
export function ATraiterPage(): JSX.Element {
  const { strings } = useI18n();
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
      <div className="flex flex-col gap-5">
        <DraftsQueue />
        <RepliesQueue />
        <HotelsQueue />
        <AuditsQueue />
      </div>
    </article>
  );
}
