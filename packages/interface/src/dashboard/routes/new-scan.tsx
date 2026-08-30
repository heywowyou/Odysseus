import { PageHeader } from '../components/page-header';
import { useI18n } from '../i18n/provider';

export function NewScanPage() {
  const { strings } = useI18n();
  return (
    <article>
      <PageHeader title={strings.newScan.title} description={strings.newScan.description} />
      <div className="rounded-xl border border-line bg-panel p-10 text-center text-sm text-ink-muted">
        {strings.common.comingSoon}
      </div>
    </article>
  );
}
