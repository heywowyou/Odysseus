import type { JSX } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Skeleton } from '../components/ui/skeleton';
import { useApi, type ApiState } from '../lib/use-api';
import { useI18n } from '../i18n/provider';
import type { OutcomesPage, OutreachDraftsPage, RepliesPage } from './outreach-model';

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
    return <Skeleton className="mt-3 h-7 w-10" />;
  }
  if (count.kind === 'unavailable') {
    return <p className="mt-3 text-base font-semibold text-ink-muted">{unavailableLabel}</p>;
  }
  return <p className="mt-3 text-xl font-semibold tracking-tight text-ink">{count.value}</p>;
}

/** The outreach hub. Each card shows the live queue count from its list
 *  endpoint; a count that failed to load renders as unavailable instead of
 *  silently disappearing, so unknown never reads as zero pending items. */
export function OutreachIndexPage(): JSX.Element {
  const { strings } = useI18n();
  const drafts = useApi<OutreachDraftsPage>('/api/outreach/drafts?limit=1');
  const replies = useApi<RepliesPage>('/api/outreach/replies?limit=1');
  const outcomes = useApi<OutcomesPage>('/api/outreach/outcomes?limit=1');

  const cards = [
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
      to: '/outreach/do-not-contact',
      title: strings.outreachIndex.cards.suppressionsTitle,
      description: strings.outreachIndex.cards.suppressionsDescription,
      count: { kind: 'none' } as HubCount,
    },
    {
      to: '/outreach/outcomes',
      title: strings.outreachIndex.cards.outcomesTitle,
      description: strings.outreachIndex.cards.outcomesDescription,
      count: hubCount(outcomes),
    },
  ];

  return (
    <>
      <PageHeader
        title={strings.outreachIndex.title}
        description={strings.outreachIndex.description}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="block rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-strong"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{card.title}</p>
              <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            </div>
            <p className="mt-1 text-sm text-ink-muted">{card.description}</p>
            <HubCountLine count={card.count} unavailableLabel={strings.common.valueUnavailable} />
          </Link>
        ))}
      </div>
    </>
  );
}
