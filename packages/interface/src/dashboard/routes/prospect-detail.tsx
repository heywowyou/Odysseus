import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 2 replaces this placeholder with the source-to-outcome
 *  prospect detail. */
export function ProspectDetailPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader
        title={strings.prospectDetail.fallbackTitle}
        description={strings.prospectDetail.description}
      />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
