import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 4 replaces this placeholder with the pending Gmail
 *  draft review list (review only, never send). */
export function DraftsPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.drafts.title} description={strings.drafts.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
