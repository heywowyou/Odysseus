import { PageHeader } from '../components/page-header';
import { useI18n } from '../i18n/provider';

export function AuditsPage() {
  const { strings } = useI18n();
  const copy = strings.page.audits;
  return (
    <article>
      <PageHeader title={copy.title} description={copy.description} />
      <div className="rounded-xl border border-line bg-panel p-10 text-center text-sm text-ink-muted">
        {copy.placeholder}
      </div>
    </article>
  );
}
