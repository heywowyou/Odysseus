import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 3 replaces this placeholder with the preview
 *  inspection view. */
export function PreviewPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.preview.title} description={strings.preview.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
