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

/** item 30 [REGRESSION]: the final page's "Une question ?" card said
 *  requests could go "directement à l'équipe Odysseus" without ever
 *  stating how to reach them - flagged once already on the haaitza pass
 *  and recurred. A single code constant, not a manual-input field or LLM
 *  output, so it can never again disappear by omission the way a
 *  manually-entered or model-written value could. odysseusaudit.com is
 *  the confirmed, live-owned business domain (CLAUDE.md, ODYSSEUS_USER_
 *  AGENT); this is a product decision (which mailbox actually receives
 *  this) rather than a verified fact, flagged for Jules to confirm or
 *  swap for a real monitored address before this ships to a client. */
export const ODYSSEUS_CONTACT_EMAIL = 'contact@odysseusaudit.com';

const DATE_LOCALES = { fr: 'fr-FR', en: 'en-GB' } as const;

export function formatDate(date: Date, language: 'fr' | 'en'): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[language], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** item 17: "depuis plus d'un an" would itself go stale the way "Échéance
 *  EAA" (a deadline framing) already had by the time this report was
 *  generated fourteen months after the date it names - computed from the
 *  report's own generation date instead of hardcoded, so it stays
 *  accurate for every future report without another copy edit. Matches
 *  the doc's own suggested phrasing exactly: under 12 whole months reads
 *  as "N mois"/"N months"; 12 and above switches to "plus de N
 *  ans"/"more than N years" (singular-cased at exactly one year, the doc's
 *  own reported case: a report generated 14 months after the date). */
export function formatElapsedDuration(from: Date, to: Date, language: 'fr' | 'en'): string {
  const totalMonths = Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 +
      (to.getMonth() - from.getMonth()) -
      (to.getDate() < from.getDate() ? 1 : 0),
  );
  if (totalMonths < 12) {
    const months = Math.max(1, totalMonths);
    return language === 'fr'
      ? `${months} mois`
      : `${months} month${months === 1 ? '' : 's'}`;
  }
  const years = Math.floor(totalMonths / 12);
  if (years === 1) {
    return language === 'fr' ? "plus d'un an" : 'more than a year';
  }
  return language === 'fr' ? `plus de ${years} ans` : `more than ${years} years`;
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

/** Always comma-separates findingIds ("f004, f005, f006"), never a range
 *  notation. B9 (report-feedback-haaitza.md): an earlier version collapsed
 *  runs of 3+ consecutive ids into "f004-f006" while every other priority
 *  used commas, reading as an inconsistency to a client comparing the two
 *  forms on the same page. */
export function formatFindingIdRefs(findingIds: readonly string[]): string {
  return [...findingIds].sort().join(', ');
}

/** Every numbered section (legal exposure through next steps) shares this
 *  two-line header shape, ported verbatim from report.reference.html: a
 *  short numbered eyebrow ("07 · Conformité") as an <h6>, then the full
 *  descriptive <h2> heading. Cover and the table of contents are
 *  unnumbered chrome and do not use this.
 *
 *  `ordinal` is passed in rather than baked into `eyebrow` (report-
 *  feedback-palais-gallien.md items 2/3/4): a section can be suppressed
 *  for having no content (observations.ts when nothing was diverted), and
 *  every following section's number must shift down to stay contiguous,
 *  which a hardcoded "07 · " prefix per language string could never do.
 *  section-registry.ts computes the live ordinal from which sections
 *  actually rendered. */
export function renderSheetHeader(ordinal: number, eyebrow: string, heading: string): string {
  const numbered = `${String(ordinal).padStart(2, '0')} · ${eyebrow}`;
  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(numbered)}</h6>
    </div>
    <h2 style="margin-bottom:var(--space-4)">${escapeHtml(heading)}</h2>
  `;
}

/** Wraps section content in the reference's `.sheet` unit (paged.css,
 *  18mm padding). A section is allowed to flow onto a second sheet by
 *  returning more content than fits one page - Paged.js handles that by
 *  fragmenting the section element itself, not by this function emitting
 *  two `<section>` tags. `extraClass` is `sheet-cover` (cover.ts) or,
 *  since item 34, `sheet-standalone` for the few sections (TOC,
 *  checklist, findings appendix) that must force their own page
 *  boundaries on both sides - every other section flows freely, sharing
 *  a physical page with its neighbour when it's short enough to fit.
 *  `id`, added for B8, gives the TOC a stable anchor target for
 *  `target-counter(attr(href url), page)`; every numbered section passes
 *  one, cover and TOC itself do not. */
export function sheet(innerHtml: string, extraClass = '', id?: string): string {
  const className = extraClass ? `sheet ${extraClass}` : 'sheet';
  const idAttr = id ? ` id="${id}"` : '';
  return `<section class="${className}"${idAttr}>${innerHtml}</section>`;
}
