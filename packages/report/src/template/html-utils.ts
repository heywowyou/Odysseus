/**
 * Every string interpolated into the HTML template originates from
 * scanner output, LLM prose, or a page URL crawled from a client's site,
 * none of which is trusted input. Escaping here is what keeps a finding
 * title containing "<script>" (a real possibility: it could be quoting a
 * client's own markup) from executing inside the report.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const DATE_LOCALES = { fr: 'fr-FR', en: 'en-GB' } as const;

export function formatDate(date: Date, language: 'fr' | 'en'): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[language], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
