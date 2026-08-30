import type { JSX } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/page-header';
import { useApi } from '../lib/use-api';
import { useI18n } from '../i18n/provider';
import type { OutcomesPage, OutreachDraftsPage, RepliesPage } from './outreach-model';

/** The outreach hub. Each card shows the live queue count from its list
 *  endpoint; the suppression card deliberately shows no count because
 *  suppression entries are never listed, only checked one value at a time. */
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
      count: drafts.data?.total,
    },
    {
      to: '/outreach/replies',
      title: strings.outreachIndex.cards.repliesTitle,
      description: strings.outreachIndex.cards.repliesDescription,
      count: replies.data?.total,
    },
    {
      to: '/outreach/suppressions',
      title: strings.outreachIndex.cards.suppressionsTitle,
      description: strings.outreachIndex.cards.suppressionsDescription,
      count: undefined,
    },
    {
      to: '/outreach/outcomes',
      title: strings.outreachIndex.cards.outcomesTitle,
      description: strings.outreachIndex.cards.outcomesDescription,
      count: outcomes.data?.total,
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
            {card.count !== undefined ? (
              <p className="mt-3 text-xl font-semibold tracking-tight text-ink">{card.count}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </>
  );
}
