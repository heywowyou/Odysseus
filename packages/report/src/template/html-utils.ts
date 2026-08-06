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

const NUMBER_LOCALES = { fr: 'fr-FR', en: 'en-US' } as const;

/** French thousands grouping uses a narrow no-break space (U+202F), not a
 *  plain space or comma - "16,490 ms" in an otherwise-French report reads
 *  as a decimal to a French reader (D27). Node's fr-FR ICU data already
 *  produces U+202F for Intl.NumberFormat, matching
 *  docs/report-v2-prototype-haaitza-fr.html's own `&#8239;` (= U+202F)
 *  usage exactly - verified, not assumed. */
export function formatNumber(value: number, language: 'fr' | 'en'): string {
  return new Intl.NumberFormat(NUMBER_LOCALES[language]).format(value);
}

/** Fills `{key}` placeholders in a static ReportStrings template with
 *  values already known safe (numbers, or strings escaped by the caller
 *  before being passed in) - used wherever a sentence's word order
 *  genuinely differs between French and English (so a single fixed
 *  concatenation order can't serve both), e.g. "N pages sur M sont
 *  saines" versus "N of M pages are healthy". */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

/** Collapses consecutive findingIds ("f004", "f005", "f006") into a
 *  compact range ("f004-f006"), matching
 *  docs/report-v2-prototype-haaitza-fr.html's theme-card reference style.
 *  Plain ASCII hyphen, not an en/em dash (CLAUDE.md style rule), and
 *  locale-neutral so it needs no fr/en translation. Runs of two stay a
 *  comma list ("f004, f005") since a range reads oddly for just a pair. */
export function formatFindingIdRefs(findingIds: readonly string[]): string {
  const sorted = [...findingIds].sort();
  if (sorted.length === 0) return '';

  const idNumber = (id: string): number | null => {
    const match = /^f(\d+)$/.exec(id);
    return match ? Number(match[1]) : null;
  };

  const groups: string[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = idNumber(sorted[i - 1]!);
    const curr = idNumber(sorted[i]!);
    const lastGroup = groups[groups.length - 1]!;
    if (prev !== null && curr !== null && curr === prev + 1) {
      lastGroup.push(sorted[i]!);
    } else {
      groups.push([sorted[i]!]);
    }
  }

  return groups
    .map((group) => (group.length >= 3 ? `${group[0]}-${group[group.length - 1]}` : group.join(', ')))
    .join(', ');
}

/** Every numbered section (stats through methodology) shares this
 *  two-line header shape, ported verbatim from
 *  docs/report-v2-prototype-haaitza-fr.html: a short numbered eyebrow
 *  ("3 · Conformité accessibilité") above the full descriptive heading.
 *  Cover and the table of contents are unnumbered chrome and do not use
 *  this. */
export function renderSectionHeader(eyebrow: string, heading: string): string {
  return `<span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(heading)}</h2>`;
}
