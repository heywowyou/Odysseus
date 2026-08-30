import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 3 replaces this placeholder with the evidence view. */
export function EvidencePage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.evidence.title} description={strings.evidence.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
