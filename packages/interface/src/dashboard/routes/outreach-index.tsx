import type { JSX } from 'react';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { useApi, type ApiState } from '../lib/use-api';
import { sendJson } from '../lib/api';
import { useI18n } from '../i18n/provider';
import type { OutcomesPage, OutreachDraftsPage, RepliesPage } from './outreach-model';

const DEFAULT_BATCH_LIMIT = 10;

/** One "start a batch job" row: a bounded limit input plus a button, per the
 *  plan's choice not to build a dedicated progress page for these jobs — a
 *  toast on enqueue is enough, the job's own drafts show up in the Drafts
 *  queue once it finishes. */
function BatchRow(props: { label: string; buttonLabel: string; path: string }): JSX.Element {
  const { strings } = useI18n();
  const [limit, setLimit] = useState(DEFAULT_BATCH_LIMIT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStart = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await sendJson<{ jobId: string }>(props.path, 'POST', { limit });
      toast.success(strings.outreachIndex.batch.started);
    } catch {
      toast.error(strings.outreachIndex.batch.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{props.label}</p>
      </div>
      <Field label={strings.outreachIndex.batch.limitLabel} htmlFor={`${props.path}-limit`}>
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

/** Card count state: a real value, a first-load skeleton, an explicit
 *  unavailable marker, or deliberately no count at all (the suppression
 *  card: entries are never listed, only checked one value at a time). */
type HubCount =
  | { kind: 'value'; value: number }
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'none' };

function hubCount(state: ApiState<{ total: number }>): HubCount {
  if (state.data !== undefined) return { kind: 'value', value: state.data.total };
  if (state.error !== undefined) return { kind: 'unavailable' };
  return { kind: 'loading' };
}

function HubCountLine(props: { count: HubCount; unavailableLabel: string }): JSX.Element | null {
  const { count, unavailableLabel } = props;
  if (count.kind === 'none') return null;
  if (count.kind === 'loading') {
    return <Skeleton className="h-7 w-10" />;
  }
  if (count.kind === 'unavailable') {
    return <p className="text-sm text-ink-muted">{unavailableLabel}</p>;
  }
  return <p className="numeric text-xl font-semibold text-ink">{count.value}</p>;
}

/** The outreach hub. Each card shows the live queue count from its list
 *  endpoint; a count that failed to load renders as unavailable instead of
 *  silently disappearing, so unknown never reads as zero pending items. */
export function OutreachIndexPage(): JSX.Element {
  const { strings } = useI18n();
  const drafts = useApi<OutreachDraftsPage>('/api/outreach/drafts?limit=1');
  const replies = useApi<RepliesPage>('/api/outreach/replies?limit=1');
  const outcomes = useApi<OutcomesPage>('/api/outreach/outcomes?limit=1');

  const stages = [
    {
      to: '/outreach/drafts',
      title: strings.outreachIndex.cards.draftsTitle,
      description: strings.outreachIndex.cards.draftsDescription,
      count: hubCount(drafts),
    },
    {
      to: '/outreach/replies',
      title: strings.outreachIndex.cards.repliesTitle,
      description: strings.outreachIndex.cards.repliesDescription,
      count: hubCount(replies),
    },
    {
      to: '/outreach/outcomes',
      title: strings.outreachIndex.cards.outcomesTitle,
      description: strings.outreachIndex.cards.outcomesDescription,
      count: hubCount(outcomes),
    },
  ];

  const standing = {
    to: '/outreach/do-not-contact',
    title: strings.outreachIndex.cards.suppressionsTitle,
    description: strings.outreachIndex.cards.suppressionsDescription,
  };

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        title={strings.outreachIndex.title}
        description={strings.outreachIndex.description}
      />
      <Card className="mb-5 flex flex-col gap-4">
        <BatchRow
          label={strings.outreachIndex.batch.draftBatchLabel}
          buttonLabel={strings.outreachIndex.batch.draftBatchButton}
          path="/api/outreach/draft-batch"
        />
        <BatchRow
          label={strings.outreachIndex.batch.followUpBatchLabel}
          buttonLabel={strings.outreachIndex.batch.followUpBatchButton}
          path="/api/outreach/followup-batch"
        />
      </Card>
      {/* Drafts, replies and outcomes are one sequence a message travels
          through, not four unrelated destinations, so they are numbered and
          stacked in that order. Suppressions sit apart underneath because
          they are a standing rule over the whole campaign rather than a
          stage of it. */}
      <ol className="flex flex-col gap-3">
        {stages.map((card, index) => (
          <li key={card.to}>
            <Link
              to={card.to}
              className="flex items-start gap-4 rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-strong"
            >
              <span
                className="numeric mt-[2px] w-5 shrink-0 text-sm text-ink-muted"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{card.title}</span>
                <span className="mt-1 block text-sm text-ink-muted">{card.description}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <HubCountLine
                  count={card.count}
                  unavailableLabel={strings.common.valueUnavailable}
                />
                <ChevronRight className="size-4 text-ink-muted" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <Link
        to={standing.to}
        className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-line px-5 py-4 transition-colors hover:border-line-strong"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{standing.title}</span>
          <span className="mt-1 block text-sm text-ink-muted">{standing.description}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      </Link>
    </article>
  );
}
