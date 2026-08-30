import { PageHeader } from '../components/page-header';
import { useI18n } from '../i18n/provider';

export function ScanProgressPage() {
  const { strings } = useI18n();
  const copy = strings.page.scanProgress;
  return (
    <article>
      <PageHeader title={copy.title} description={copy.description} />
      <div className="rounded-xl border border-line bg-panel p-10 text-center text-sm text-ink-muted">
        {copy.placeholder}
      </div>
    </article>
  );
}
