import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 2 replaces this placeholder with the filterable
 *  prospect list. */
export function ProspectsPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.prospects.title} description={strings.prospects.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
