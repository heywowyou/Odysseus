import { Link } from 'react-router';
import { PageHeader } from '../components/page-header';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 4 replaces this placeholder with the outreach hub
 *  linking drafts, replies, suppressions, and outcomes. */
export function OutreachIndexPage() {
  const { strings } = useI18n();
  const cards = [
    {
      to: '/outreach/drafts',
      title: strings.outreachIndex.cards.draftsTitle,
      description: strings.outreachIndex.cards.draftsDescription,
    },
    {
      to: '/outreach/replies',
      title: strings.outreachIndex.cards.repliesTitle,
      description: strings.outreachIndex.cards.repliesDescription,
    },
    {
      to: '/outreach/suppressions',
      title: strings.outreachIndex.cards.suppressionsTitle,
      description: strings.outreachIndex.cards.suppressionsDescription,
    },
    {
      to: '/outreach/outcomes',
      title: strings.outreachIndex.cards.outcomesTitle,
      description: strings.outreachIndex.cards.outcomesDescription,
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
          <Card key={card.to} className="h-full">
            <p className="text-sm font-semibold text-ink">
              <Link to={card.to} className="font-medium text-ink hover:text-accent-bright">
                {card.title}
              </Link>
            </p>
            <p className="mt-1 text-sm text-ink-muted">{card.description}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
