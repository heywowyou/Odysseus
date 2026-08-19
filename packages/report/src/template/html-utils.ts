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

/** item 3.13/31: no issuer identity (legal entity, signatory, SIRET)
 *  anywhere in a paid deliverable that may be forwarded to counsel. Code
 *  constants, same reasoning and same "flag for Jules, never silently
 *  omit" posture as ODYSSEUS_CONTACT_EMAIL above - not manual-input
 *  fields or LLM output. ODYSSEUS_SIRET is a genuine placeholder, not a
 *  real number: rendered so it reads as visibly incomplete
 *  ("[SIRET à renseigner]") rather than a plausible-looking fake number,
 *  so nobody mistakes it for real and publishes it. Replace with the
 *  real SIRET before this next ships. */
export const ODYSSEUS_PRODUCER_NAME = 'Odysseus Audit';
export const ODYSSEUS_SIGNATORY_NAME = 'Jules Fontaine';
export const ODYSSEUS_SIRET_PLACEHOLDER = '[SIRET à renseigner]';

/** item 3.12: "Prochaines étapes" described re-audits and post-fix
 *  verification with no price, no lead time, and no way to order -
 *  the one page in the report with commercial upside converted nothing.
 *  Placeholder pricing (no existing reference point in the codebase or
 *  docs/offer-positioning.md for a re-audit specifically, only for the
 *  full audit itself): roughly 28% of the EUR 1,600 HT full-audit price,
 *  reasoned as a verification pass being narrower in scope than a full
 *  re-scan. Confirm with Jules and replace before this next ships. */
export const ODYSSEUS_REAUDIT_PRICE_EUR_HT = 450;
export const ODYSSEUS_REAUDIT_LEAD_TIME_DAYS = 5;

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

/** report-feedback-la-corniche.md item 3.2 [REGRESSION of report-
 *  feedback-palais-gallien-v2.md item 0.5 in a different template]:
 *  every plural-count sentence in the report picked its own ad hoc
 *  fix (or none at all - "2 page(s) ont été exclues" leaked the
 *  pluralisation placeholder verbatim into a real report). One shared
 *  helper closes both instances at once and stops a third one from
 *  needing its own bespoke fix later. */
export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
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

/** item 3.3: "Constats : f002, f003, f004, f006" gave the client no page
 *  number and no link, so finding a referenced id meant scanning 25 annex
 *  pages by hand. Each id links to `#annexref-{id}`, the anchor
 *  findings-appendix.ts's renderSubTableRow now sets on every annex row -
 *  a real PDF internal link (verified by print-inversion-style tests
 *  extracting the PDF's own /Annots, not just visual inspection), not a
 *  page number, since Paged.js page numbers for an arbitrary annex row
 *  are not resolvable without a second layout pass this codebase does not
 *  otherwise need (unlike the TOC's target-counter, which points at a
 *  small, fixed set of section starts). Returns raw HTML, not text -
 *  callers must not escapeHtml() the result a second time. */
export function formatFindingIdLinks(findingIds: readonly string[]): string {
  return [...findingIds]
    .sort()
    .map((id) => `<a href="#annexref-${escapeHtml(id)}" style="color:inherit;text-decoration:underline">${escapeHtml(id)}</a>`)
    .join(', ');
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
 *  actually rendered.
 *
 *  item 2.1: a section header could be orphaned alone at the bottom of a
 *  page - not because h2 itself broke (h2's own break-after:avoid in
 *  paged.css already prevented that) but because the eyebrow's wrapping
 *  <div> and the <h2> below it are two separate sibling elements with no
 *  break rule between *them*, so Paged.js could legally break right there,
 *  stranding the "01 · Constats" eyebrow alone with the real heading
 *  pushed to the next page. Wrapping both in one `.section-head` element
 *  (break-inside:avoid, paged.css) makes that break location illegal too. */
export function renderSheetHeader(ordinal: number, eyebrow: string, heading: string): string {
  const numbered = `${String(ordinal).padStart(2, '0')} · ${eyebrow}`;
  return `
    <div class="section-head">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
        <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(numbered)}</h6>
      </div>
      <h2 style="margin-bottom:var(--space-4)">${escapeHtml(heading)}</h2>
    </div>
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
