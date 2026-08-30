import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 4 replaces this placeholder with the suppression
 *  lookup-by-entered-value view. */
export function SuppressionsPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader
        title={strings.suppressions.title}
        description={strings.suppressions.description}
      />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
