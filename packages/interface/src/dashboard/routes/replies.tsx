import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 4 replaces this placeholder with the replies-needing-
 *  review list (metadata only). */
export function RepliesPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.replies.title} description={strings.replies.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
