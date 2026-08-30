import { PageHeader } from '../components/page-header';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';

/** Plan 013 slice 3 replaces this placeholder with the score breakdown
 *  and version diff view. */
export function ScorePage() {
  const { strings } = useI18n();
  return (
    <>
      <PageHeader title={strings.score.title} description={strings.score.description} />
      <EmptyState title={strings.common.comingSoon} />
    </>
  );
}
