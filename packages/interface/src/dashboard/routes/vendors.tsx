import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 3 replaces this placeholder with the vendor
 *  fingerprint aggregate. */
export function VendorsPage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.vendors.title} description={strings.vendors.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
