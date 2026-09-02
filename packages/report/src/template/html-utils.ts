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

/** A6 (2026-08-24 three-site review): a real La Corniche report printed
 *  "des liens *hreflang* non réciproques" and "un attribut *aria-label*"
 *  with the asterisks visible, and a Haaitza report did the same. The
 *  writing prompt already says "no markdown fences", which the model
 *  obeys - it emits valid JSON - but it still reaches for inline
 *  emphasis *inside* a field value, which no fence rule covers.
 *
 *  Stripped at render time rather than before the analysis is stored, so
 *  what is persisted stays byte-identical to what the model actually
 *  returned. That provenance matters here for the same reason the
 *  manifest records self-reported scanner versions: the stored artifact
 *  is evidence of what happened, the report is a presentation of it.
 *
 *  Only the emphasis delimiters are removed, never the text between
 *  them. Code spans keep their content for the same reason. An asterisk
 *  or underscore that is not part of a delimiter pair is left alone, so
 *  a hotel's own "5*****" or a snake_case attribute name survives. */
const MARKDOWN_EMPHASIS_PATTERNS: readonly RegExp[] = [
  /\*\*\*([^*\n]+?)\*\*\*/gu,
  /\*\*([^*\n]+?)\*\*/gu,
  /\*([^*\n]+?)\*/gu,
  /___([^_\n]+?)___/gu,
  /__([^_\n]+?)__/gu,
  /`([^`\n]+?)`/gu,
];

export function stripInlineMarkdown(value: string): string {
  let result = value;
  for (const pattern of MARKDOWN_EMPHASIS_PATTERNS) {
    result = result.replace(pattern, '$1');
  }
  return result;
}

/** Use for any string written by the model. Plain escapeHtml stays
 *  correct for scanner output, string-file copy and URLs - those never
 *  contain markdown, and running the stripper over a CSS selector like
 *  `a[href*="x"]` could damage it. */
export function escapeProse(value: string): string {
  return escapeHtml(stripInlineMarkdown(value));
}

/** item 30 [REGRESSION]: the final page's "Une question ?" card said
 *  requests could go "directement à l'équipe Odysseus" without ever
 *  stating how to reach them - flagged once already on the haaitza pass
 *  and recurred. A single code constant, not a manual-input field or LLM
 *  output, so it can never again disappear by omission the way a
 *  manually-entered or model-written value could. odysseusaudit.com is
 *  the confirmed, live-owned business domain (CLAUDE.md, ODYSSEUS_USER_
 *  AGENT). Confirmed by Jules 2026-08-19 as the real, monitored mailbox -
 *  no longer a placeholder awaiting an answer. */
export const ODYSSEUS_CONTACT_EMAIL = 'contact@odysseusaudit.com';

/** item 3.13/31: no issuer identity (legal entity, signatory, SIRET)
 *  anywhere in a paid deliverable that may be forwarded to counsel. Code
 *  constants, same reasoning and same "flag for Jules, never silently
 *  omit" posture as ODYSSEUS_CONTACT_EMAIL above - not manual-input
 *  fields or LLM output.
 *
 *  A3 (2026-08-24): the placeholder was replaced by the nine-digit SIREN
 *  Jules supplied, and the label was moved from SIRET to SIREN to match
 *  the number rather than padding the number to fit the label.
 *
 *  Updated later the same day: Jules supplied the full fourteen-digit
 *  SIRET (the same SIREN followed by NIC 00023), so the number and the
 *  label move back together, exactly as the note above said they must.
 *  A SIRET identifies one establishment where a SIREN identifies the
 *  legal entity, which is the more precise thing to print on the
 *  signature line of a document that may be forwarded to counsel - it is
 *  the same distinction packages/scanner/src/checks/mentions-legales.ts
 *  already encodes when reading a client's own legal notice.
 *
 *  Overridable via ODYSSEUS_SIRET, with SIRET retained for the repository's
 *  existing environment file, so the value can be set per machine without a
 *  code change. The literal stays as the canonical default so an unset
 *  environment can never silently produce a report with no issuer identity,
 *  which is the failure this constant exists to prevent. */
export const ODYSSEUS_PRODUCER_NAME = 'Odysseus Audit';
export const ODYSSEUS_SIGNATORY_NAME = 'Jules Fontaine';
export const ODYSSEUS_REGISTRATION_NUMBER =
  process.env['ODYSSEUS_SIRET'] ?? process.env['SIRET'] ?? '98076646300023';

/** item 3.12: "Prochaines étapes" described re-audits and post-fix
 *  verification with no price, no lead time, and no way to order -
 *  the one page in the report with commercial upside converted nothing.
 *  Reasoned originally as roughly 28% of the EUR 1,600 HT full-audit
 *  price, a verification pass being narrower in scope than a full
 *  re-scan. Confirmed by Jules 2026-08-19 as the canonical re-audit
 *  price and lead time; documented alongside the full-audit price in
 *  docs/rules/offer-positioning.md section 1. No longer a placeholder. */
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
    return language === 'fr' ? `${months} mois` : `${months} month${months === 1 ? '' : 's'}`;
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
    .map(
      (id) =>
        `<a href="#annexref-${escapeHtml(id)}" style="color:inherit;text-decoration:underline">${escapeHtml(id)}</a>`,
    )
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
/** `headingGap` is the plan 023 per-section rhythm: the flat design
 *  source varies the h2's margin-bottom by what follows it - tight
 *  (--space-2) over table-led sections so the heading binds to its
 *  table, medium/generous over prose-led and airy sections (the map
 *  lives in docs/report/report-design-system.md section 2, values in
 *  report-design-tokens.md). The old uniform --space-4 was the one
 *  undocumented drift the 2026-09-02 flat re-verification found. */
export function renderSheetHeader(
  ordinal: number,
  eyebrow: string,
  heading: string,
  headingGap: string = 'var(--space-4)',
): string {
  const numbered = `${String(ordinal).padStart(2, '0')} · ${eyebrow}`;
  return `
    <div class="section-head">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
        <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(numbered)}</h6>
      </div>
      <h2 style="margin-bottom:${headingGap}">${escapeHtml(heading)}</h2>
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

/** Shared cap for every client-facing list of finding ids.
 *
 *  A7 (2026-08-24 three-site review): checklist.ts capped its own list at
 *  10 in a7baac6, but themes.ts's priority card kept calling
 *  formatFindingIdLinks uncapped, so a real Haaitza theme with 265
 *  findingIds spilled the card's metadata row across two full pages and
 *  then degraded into the one-fragment-per-line collapse CLAUDE.md
 *  trade-off 17 already root-caused twice (appendix groups, then the
 *  checklist cell). Same mechanism, third section - so the cap lives here
 *  now, once, and both call sites read it, rather than each section
 *  growing its own constant and its own drift.
 *
 *  10 is deliberate and unchanged from checklist.ts's original value: the
 *  ids exist so the reader has something to look up in the annex, not so
 *  the card enumerates every one. The annex is already the complete list. */
export const FINDING_ID_LIST_CAP = 10;

function capFindingIds(findingIds: readonly string[]): { shown: string[]; remaining: number } {
  const sorted = [...findingIds].sort();
  if (sorted.length <= FINDING_ID_LIST_CAP) return { shown: sorted, remaining: 0 };
  return {
    shown: sorted.slice(0, FINDING_ID_LIST_CAP),
    remaining: sorted.length - FINDING_ID_LIST_CAP,
  };
}

/** Plain-text capped variant, for cells that cannot carry links. */
/** Resolves the "and N more" tail for a capped list, picking the singular
 *  form at exactly one. Every capped-list helper below takes the whole
 *  strings object rather than one template, so a caller cannot pass the
 *  plural form alone and silently reintroduce "et 1 autres" - which is
 *  what a real report printed before this existed. */
export interface AndNMoreStrings {
  readonly andNMoreTemplate: string;
  readonly andNMoreSingularTemplate: string;
}

export function formatAndNMore(
  remaining: number,
  language: 'fr' | 'en',
  strings: AndNMoreStrings,
): string {
  return fillTemplate(
    pluralize(remaining, strings.andNMoreSingularTemplate, strings.andNMoreTemplate),
    {
      count: formatNumber(remaining, language),
    },
  );
}

export function formatCappedFindingIdRefs(
  findingIds: readonly string[],
  language: 'fr' | 'en',
  strings: AndNMoreStrings,
): string {
  const { shown, remaining } = capFindingIds(findingIds);
  if (remaining === 0) return shown.join(', ');
  return `${shown.join(', ')} ${formatAndNMore(remaining, language, strings)}`;
}

/** Generic capped join, for any short-token list rendered inside a
 *  fixed-width grid cell. The checklist's 80px WCAG column is the second
 *  such cell found (A4/overflow audit, 2026-08-24): a theme spanning ten
 *  criteria puts roughly sixty characters into it, and `.row-atomic`
 *  (paged.css) then forbids the row from breaking, which is exactly the
 *  fragment-taller-than-a-page condition CLAUDE.md trade-off 17 root-
 *  caused. Bounding the content is the fix; loosening atomicity is not,
 *  since a checklist row genuinely should not split. */
export function formatCappedList(
  values: readonly string[],
  cap: number,
  language: 'fr' | 'en',
  strings: AndNMoreStrings,
): string {
  if (values.length <= cap) return values.join(', ');
  const remaining = values.length - cap;
  return `${values.slice(0, cap).join(', ')} ${formatAndNMore(remaining, language, strings)}`;
}

/** Linked capped variant. Returns raw HTML - do not escapeHtml() again.
 *  The "et N autres" tail is escaped here since it comes from the string
 *  files, which are trusted but templated. */
export function formatCappedFindingIdLinks(
  findingIds: readonly string[],
  language: 'fr' | 'en',
  strings: AndNMoreStrings,
): string {
  const { shown, remaining } = capFindingIds(findingIds);
  const links = formatFindingIdLinks(shown);
  if (remaining === 0) return links;
  const tail = formatAndNMore(remaining, language, strings);
  return `${links} <span class="text-muted">${escapeHtml(tail)}</span>`;
}
