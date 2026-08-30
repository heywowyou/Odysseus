import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 4 replaces this placeholder with the outcome summary
 *  and per-candidate outcome actions. */
export function OutcomesPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.outcomes.title} description={strings.outcomes.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
