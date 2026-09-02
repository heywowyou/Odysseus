import {
  buildClusterLookup,
  groupPageUrlsByTranslation,
  type ClusterLookup,
} from '../page-url-groups.js';
import type {
  AuditManifest,
  Finding,
  FindingCategory,
  ReportLanguage,
  StatSector,
} from '@odysseus/core';
import { selectReferenceStats } from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from '@odysseus/llm';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatAndNMore,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { renderSeverityBadge } from '../severity-badge.js';
import { CATEGORY, CATEGORY_ORDER } from '../design-tokens.js';
import { renderReferenceStatNote } from '../reference-stat-note.js';
import { groupAppendix, type RuleGroup } from '../appendix-grouping.js';
import { resolveFindingDisplayLabel, RULE_TRANSLATIONS_FR } from '../rule-translations.js';
import { detectFindingVendor, isThirdPartyFinding } from '../third-party-attribution.js';
import { buildCoverageDisclosure } from '../coverage-disclosure.js';

function renderRuleSum(strings: ReportStrings, language: ReportLanguage, group: RuleGroup): string {
  const a = strings.findingsAppendix;
  const parts = [
    `${formatNumber(group.findings.length, language)} ${pluralize(group.findings.length, a.findingSingular, a.findingPlural)}`,
    `${formatNumber(group.totalOccurrences, language)} ${pluralize(group.totalOccurrences, a.occurrenceSingular, a.occurrencePlural)}`,
    // item 1.6: no longer "jusqu'à N pages" ("up to") - group.pages is now
    // a real union across every finding's own pageUrls, not the largest
    // single finding's page count, so it is an exact figure, not an
    // upper bound. Kept a plain "N pages" instead of introducing a
    // denominator ("N sur M", matching the priority card's own wording)
    // since this group can span more rule ids than any one priority card
    // does (rule-family clustering, item 1.3) and a borrowed "sur M" here
    // would need its own explanation.
    `${formatNumber(group.pages, language)} ${pluralize(group.pages, a.pageSingular, a.pagePlural)}`,
  ];
  if (group.wcagCriteria.length > 0) {
    parts.push(`${a.wcagLabel} ${group.wcagCriteria.join(', ')}`);
  }
  return escapeHtml(parts.join(' · '));
}

// item 2.4: "Sélecteur type" wrapped onto two lines in a narrow header
// cell, reading as a merged "SÉLECTEUR / TYPE" two-row header - as if a
// second, empty "TYPE" column existed, on a majority of rows that carry
// no selector at all (page-level Lighthouse findings). white-space:nowrap
// stops any header label from wrapping regardless of column width; the
// label itself was also reworded (strings/fr.ts) to read unambiguously as
// one phrase even where it does have room to wrap.
//
// Real <table>/<thead>/<tbody> markup, not a CSS grid of divs - same
// pagedjs-fragility fix core-web-vitals-table.ts already applied (see its
// own item 2.2 comment). This section's rows used to be `.row-atomic`
// divs (`display: contents; break-inside: avoid`), and Paged.js's own
// fragmentation engine does not reliably handle `display: contents`
// content: a real La Corniche report (report-feedback-la-corniche.md
// items 0.2/0.7) hit Paged.js's "Layout repeated" infinite-loop guard
// pointed directly at this section once the surrounding page-break math
// shifted, silently truncating the PDF's last several pages (the GEO/
// Rendu annex groups, the glossary, and the next-steps section all
// vanished with no error). Real `<tr>` elements are Paged.js's
// well-supported, standard fragmentation unit and do not carry this
// risk.
/** 2026-08-24: table-layout:fixed is load-bearing, not cosmetic. With the
 *  default auto layout the headCell widths below are only hints, and
 *  Paged.js recomputes them per fragment: a rule group split across a page
 *  break got a narrower first column on the continuation page, squeezed by
 *  that fragment's own longest selector, and that cell's
 *  overflow-wrap:anywhere then broke "f052" across two lines as "f05" /
 *  "2" from page 20 of a real 29-page PDF onwards. Fixed layout makes every
 *  fragment lay out identically; the first cell is additionally nowrap so
 *  an id can never break mid-token even if a future change squeezes it
 *  again. */
const APPENDIX_TABLE_STYLE =
  'width:100%;table-layout:auto;border-collapse:collapse;font-size:12.5px';

/** D2 (2026-08-25, Lagnonu review): the four column widths, declared on
 *  every row rather than only on the header.
 *
 *  table-layout:fixed takes its widths from the first row of whatever it is
 *  laying out, and Paged.js gives a continuation fragment the tbody rows
 *  without the thead - so every page after the first lost the declarations
 *  entirely and fell back to distributing the width equally. Measured on a
 *  real report: the selector column began at x~325 on the page carrying the
 *  header and x~530 on every page after it, and selectors then wrapped
 *  mid-token, `.link[href$="contact` / `o"]`. Carrying the widths on the
 *  cells makes every fragment lay out identically whether or not it happens
 *  to contain the header - but not on its own: table-layout:fixed reads the
 *  first row of the fragment, and a page can open on a full-width
 *  colspan="4" page-URL row, which declares no column widths at all. The
 *  colgroup below is what actually pins the columns, since it applies to the
 *  table regardless of which row leads the fragment. Both are kept: the
 *  colgroup is the guarantee, the per-cell widths make each row
 *  self-describing if a future change ever splits these into separate
 *  tables. */
const APPENDIX_COLUMN_WIDTHS = ['80px', '90px', '100px', 'auto'] as const;

function headCell(label: string, width: string): string {
  return `<th style="width:${width};padding:6px var(--space-2);font-size:10px;letter-spacing:0.02em;text-transform:uppercase;text-align:left;font-weight:400;color:color-mix(in srgb, var(--color-text) 55%, transparent);border-bottom:1px solid var(--color-divider);white-space:nowrap">${escapeHtml(label)}</th>`;
}

function cell(html: string, extra = '', width?: string): string {
  const widthRule = width === undefined ? '' : `width:${width};`;
  return `<td style="${widthRule}padding:6px var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</td>`;
}

/** item 25: every finding row states a page count ("9 pages") and never
 *  the actual URLs - the largest gap between what a paid full-audit
 *  client is promised (docs/product/odysseus-project-brief.md 3.3: "Full page
 *  and selector detail for every finding") and what the appendix
 *  delivers. Rendered as a full-width line under each finding's own row
 *  (grid-column spans every column of the 4-column layout above it), a
 *  plain comma-joined list rather than a second sub-table - the selector
 *  cell already carries the .url-cell wrapping rules (paged.css) this
 *  reuses.
 *
 *  item 3.1: a finding hitting all N crawled pages used to reprint the
 *  full N-URL list verbatim, and did so again for every other finding
 *  that also hit every page - roughly 18 of 37 pages in a real report
 *  were repeated URL lists. When a finding's own pages equal the total
 *  crawled, collapse to "Toutes les pages analysées (N)" instead of
 *  listing them; otherwise cap the visible list and name the remainder
 *  ("et N autres"), never truncating silently. */
/** 2026-08-22, La Corniche report review: computes the same sorted-URL
 *  signature renderPageUrlList itself sorts by, so a caller can detect
 *  "this finding's page set is byte-identical to an earlier finding's in
 *  the same rule group" before ever building the list text. Length-1 sets
 *  are excluded - there is nothing to save by deduping a single URL. */
function pageUrlSetSignature(finding: Finding): string | undefined {
  if (finding.pageUrls.length <= 1) return undefined;
  return [...finding.pageUrls].sort().join('\u0000');
}

function renderPageUrlList(
  strings: ReportStrings,
  language: ReportLanguage,
  finding: Finding,
  totalPagesScanned: number,
  /** The earlier finding in this rule group whose page-URL set is
   *  byte-identical to this one's, if any - set by renderRuleGroup after
   *  it has seen every finding in the group in id order. Undefined for
   *  the first finding to have a given set, or when this finding's set is
   *  unique within the group. */
  samePagesAsFindingId: string | undefined,
  /** B2: translation clusters read off the manifest, so five language
   *  variants of one page print as one URL plus its language list rather
   *  than five near-identical URLs that consume the whole cap. */
  clusterLookup: ClusterLookup,
): string {
  if (finding.pageUrls.length === 0) return '';
  const a = strings.findingsAppendix;

  let urlsText: string;
  if (samePagesAsFindingId !== undefined) {
    urlsText = fillTemplate(a.samePagesAsTemplate, { findingId: samePagesAsFindingId });
  } else {
    const groups = groupPageUrlsByTranslation(finding.pageUrls, clusterLookup);
    const entries = groups.map((group) =>
      group.languages.length > 0
        ? `${group.pageUrl} (${group.languages.join(', ')})`
        : group.pageUrl,
    );
    // The "all pages" collapse still compares raw page counts: the claim
    // is about the crawl's own scope, which is counted in real pages.
    if (totalPagesScanned > 0 && finding.pageUrls.length === totalPagesScanned) {
      urlsText = fillTemplate(a.allPagesAnalyzedTemplate, {
        count: formatNumber(totalPagesScanned, language),
      });
    } else if (entries.length > PAGE_URL_LIST_CAP) {
      const shown = entries.slice(0, PAGE_URL_LIST_CAP);
      const remaining = entries.length - PAGE_URL_LIST_CAP;
      urlsText = `${shown.join(', ')} ${formatAndNMore(remaining, language, a)}`;
    } else {
      urlsText = entries.join(', ');
    }
  }

  // paged.css's `.appendix-url-row { break-before: avoid }` keeps this row
  // attached to the finding row directly above it - real <tr> siblings,
  // unlike the old display:contents `.row-atomic` wrapper, are two
  // independently breakable fragments by default, so this replaces that
  // wrapper's atomicity for the one pair of rows that actually needs it.
  return `<tr class="appendix-url-row"><td class="url-cell" colspan="4" style="padding:0 var(--space-2) 6px;font-size:10.5px;opacity:0.6">${escapeHtml(a.pagesColumnLabel)} : ${escapeHtml(urlsText)}</td></tr>`;
}

/** item 3.1's own suggested cap. */
const PAGE_URL_LIST_CAP = 5;

/** B4 (2026-08-24): the affected files for a site-wide resource finding
 *  (normalize-lighthouse.ts's RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS), read
 *  off rawEvidence.resourceUrls. Those findings collapse every item of one
 *  audit into a single row, so elements[0].selector is whichever DOM node
 *  happened to sort first - true of one occurrence, misleading as the row's
 *  only detail. The file list is what the client acts on. */
const RESOURCE_URL_LIST_CAP = 8;

function findingResourceUrls(finding: Finding): string[] {
  const raw = (finding.rawEvidence as { resourceUrls?: unknown }).resourceUrls;
  if (!Array.isArray(raw)) return [];
  return raw.filter((url): url is string => typeof url === 'string');
}

/** 2026-08-25: the files named by the finding's own occurrences, for
 *  element-scoped rules that were never collapsed onto a file identity.
 *
 *  Different from findingResourceUrls above, and deliberately not merged
 *  with it. A collapsed resource finding IS its file list, so that list
 *  replaces the selector column. An element-scoped finding is about a place
 *  in a page that happens to be an image, so it keeps its selector and gains
 *  the filename underneath: the developer needs both halves, "which element"
 *  and "which file", and neither answers the other. */
function elementResourceUrls(finding: Finding): string[] {
  return [
    ...new Set(
      finding.elements
        .map((element) => element.resourceUrl)
        .filter((url): url is string => typeof url === 'string' && url.length > 0),
    ),
  ].sort();
}

/** Path and filename only. A column of forty absolute URLs sharing one
 *  origin is unreadable, and the origin is already on the cover.
 *
 *  A credential-shaped param (key/token/secret/auth/password) is stripped
 *  before rebuilding the query string, since a Lighthouse-reported LCP
 *  resource can legitimately be a third-party request carrying one (a real
 *  Google Maps tile URL, e.g. f084 on the Lagnonu report) - this is a
 *  client-forwardable PDF, not a debug log. Ordinary cache-busting params
 *  are kept, per this function's existing behaviour. */
const CREDENTIAL_LOOKING_PARAM_PATTERN = /key|token|secret|auth|password/i;

function shortenResourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (CREDENTIAL_LOOKING_PARAM_PATTERN.test(key)) parsed.searchParams.delete(key);
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function renderResourceUrlList(
  strings: ReportStrings,
  language: ReportLanguage,
  finding: Finding,
): string {
  const collapsed = findingResourceUrls(finding);
  const fromElements = collapsed.length === 0;
  const urls = collapsed.length > 0 ? collapsed : elementResourceUrls(finding);
  if (urls.length === 0) return '';
  const a = strings.findingsAppendix;

  // mergeGroup stores at most MAX_ELEMENTS_PER_FINDING occurrences, so an
  // element-derived list on a finding with more occurrences than that is a
  // sample and the true number of distinct files is genuinely unknown. Say
  // "examples" and print no remainder rather than compute an "et N autres"
  // against a set we know is truncated - a wrong count is worse than no
  // count, the same reasoning the cover uses for an unconfirmed name.
  const truncated = fromElements && finding.elements.length < finding.occurrences;

  const shown = urls.slice(0, RESOURCE_URL_LIST_CAP).map(shortenResourceUrl);
  const remaining = urls.length - shown.length;
  const text =
    remaining > 0 && !truncated
      ? `${shown.join(', ')} ${formatAndNMore(remaining, language, a)}`
      : shown.join(', ');
  const label = truncated ? a.affectedFilesSampleLabel : a.affectedFilesLabel;

  return `<tr class="appendix-url-row"><td class="url-cell" colspan="4" style="padding:0 var(--space-2) 6px;font-size:10.5px;opacity:0.6">${escapeHtml(label)} : ${escapeHtml(text)}</td></tr>`;
}

/** item 3.3: the anchor formatFindingIdLinks (html-utils.ts) links to from
 *  a theme card's "Constats : f002, f003" reference list - every annex
 *  row gets one, not only rows a theme happens to cite, since a finding
 *  id can be referenced from more than one place (e.g. a future
 *  cross-reference) and the annex is generated once, independent of who
 *  ends up linking to it. */
// item 2.6 (La Corniche pass): a shadow-piercing selector
// (`iframe >>> iframe >>> .captcha__header__logo`) or a long descendant
// chain wrapped across 3 lines and visually dominated its row next to
// every other row's single line.
//
// A line-clamp/ellipsis truncation was tried first and reverted: it
// visually clips the DOM content, and Chromium's PDF text layer only
// contains what actually rendered, so a clamped selector's tail is
// genuinely gone from the PDF's own text - confirmed by running it
// against pdf-text-integrity.test.ts (item 0.4's regression test for
// exactly this: "the PDF text layer never drops... characters"), which
// failed immediately with the clamped selectors missing from extracted
// text. That invariant is deliberate and pre-existing; this fix must not
// trade it away. A long selector instead renders at a smaller font size
// so more of it fits per line without losing any character - full text,
// smaller footprint, not truncated content.
const LONG_SELECTOR_LENGTH_THRESHOLD = 50;

function selectorCellStyle(selector: string): string {
  const fontSize = selector.length > LONG_SELECTOR_LENGTH_THRESHOLD ? '10px' : '12.5px';
  return `font-family:ui-monospace,monospace;overflow-wrap:anywhere;word-break:normal;hyphens:none;opacity:0.8;font-size:${fontSize}`;
}

function renderSubTableRow(
  strings: ReportStrings,
  language: ReportLanguage,
  finding: Finding,
  totalPagesScanned: number,
  samePagesAsFindingId: string | undefined,
  clusterLookup: ClusterLookup,
): string {
  // B4: a site-wide resource finding has no meaningful single selector -
  // its detail is the file list rendered below, so the column states how
  // many files rather than naming an arbitrary one of their DOM nodes.
  const resourceUrls = findingResourceUrls(finding);
  const selector =
    resourceUrls.length > 0
      ? fillTemplate(
          pluralize(
            resourceUrls.length,
            strings.findingsAppendix.affectedFilesCountSingularTemplate,
            strings.findingsAppendix.affectedFilesCountTemplate,
          ),
          { count: formatNumber(resourceUrls.length, language) },
        )
      : (finding.elements[0]?.selector ?? '');
  return `
    <tr id="annexref-${escapeHtml(finding.findingId)}">
      ${cell(escapeHtml(finding.findingId), 'font-family:ui-monospace,monospace;white-space:nowrap', APPENDIX_COLUMN_WIDTHS[0])}
      ${cell(formatNumber(finding.pageUrls.length, language), '', APPENDIX_COLUMN_WIDTHS[1])}
      ${cell(formatNumber(finding.occurrences, language), '', APPENDIX_COLUMN_WIDTHS[2])}
      ${cell(escapeHtml(selector), selectorCellStyle(selector), APPENDIX_COLUMN_WIDTHS[3])}
    </tr>
    ${renderResourceUrlList(strings, language, finding)}
    ${renderPageUrlList(strings, language, finding, totalPagesScanned, samePagesAsFindingId, clusterLookup)}
  `;
}

function renderRuleGroup(
  strings: ReportStrings,
  language: ReportLanguage,
  group: RuleGroup,
  isFullyDiverted: boolean,
  totalPagesScanned: number,
  /** item 1.4: shown only in the third-party block below - the vendor
   *  name when detectFindingVendor found one consistently across the
   *  group, or a generic "unidentified vendor" label for a frame-
   *  crossing selector matching none of the known prefixes. */
  clusterLookup: ClusterLookup,
  vendorLabel?: string,
  /** Fix #6, 2026-08-25 report review: the number of this same rule's
   *  occurrences that landed in the third-party section instead (item 1.4's
   *  partition), so a first-party reader is not left thinking a rule they
   *  see 3 times here is the rule's entire footprint when a vendor-embedded
   *  instance of it also exists a few pages later. Purely a pointer sentence
   *  computed from the caller's own partitioned data; does not change what
   *  is counted where. */
  thirdPartyCrossRefCount = 0,
): string {
  const a = strings.findingsAppendix;
  const thirdPartyCrossRefNote =
    thirdPartyCrossRefCount > 0
      ? `<p style="font-size:11px;opacity:0.55;margin-top:2px">${escapeHtml(
          fillTemplate(a.splitGroupThirdPartyNoteTemplate, {
            count: formatNumber(thirdPartyCrossRefCount, language),
            thirdPartyHeading: a.thirdPartyHeading,
          }),
        )}</p>`
      : '';
  const vendorTag = vendorLabel
    ? `<span class="tag" style="background:var(--color-surface);opacity:0.75;font-size:10.5px">${escapeHtml(vendorLabel)}</span>`
    : '';
  // item 38 [REGRESSION]: rule titles and codes rendered in English inside
  // a French report - the label is resolved through the shared helper in
  // rule-translations.ts (plan 018 step 6) so this section and the
  // priority cards' evidence cannot disagree about a defect's name. The
  // gloss (a short plain-language explanation) is fr-only, shown under the
  // machine-readable rule code for the cryptic "-insight" style codes a
  // non-technical reader can't otherwise decode.
  const translation = language === 'fr' ? RULE_TRANSLATIONS_FR[group.ruleId] : undefined;
  const representativeTitle = resolveFindingDisplayLabel(
    language,
    group.ruleId,
    group.findings[0]?.title,
  );
  const gloss = translation
    ? `<span style="font-size:10px;opacity:0.5">- ${escapeHtml(translation.gloss)}</span>`
    : '';
  // item 1.3: a clustered group's `ruleId` is a synthetic family key
  // (e.g. "image-weight"), not a real scanner rule a developer could grep
  // for - showing it in the same "machine rule code" badge style as an
  // ordinary group would misrepresent it as one. List every actual member
  // rule id instead, comma-separated, same visual weight as the ordinary
  // single-code badge.
  const ruleCodeDisplay =
    group.memberRuleIds.length > 1 ? group.memberRuleIds.join(', ') : group.ruleId;
  const sortedFindings = [...group.findings].sort((x, y) => x.findingId.localeCompare(y.findingId));
  // 2026-08-22, La Corniche report review: findings are already visited
  // in findingId order, so the first finding to carry a given page-URL
  // signature is always the earliest id - exactly what samePagesAsTemplate
  // should point a reader back to.
  const seenPageUrlSignatures = new Map<string, string>();
  const rows = sortedFindings
    .map((finding) => {
      const signature = pageUrlSetSignature(finding);
      const samePagesAsFindingId =
        signature !== undefined ? seenPageUrlSignatures.get(signature) : undefined;
      if (signature !== undefined && samePagesAsFindingId === undefined) {
        seenPageUrlSignatures.set(signature, finding.findingId);
      }
      return renderSubTableRow(
        strings,
        language,
        finding,
        totalPagesScanned,
        samePagesAsFindingId,
        clusterLookup,
      );
    })
    .join('');
  const obsTag = isFullyDiverted
    ? `<span class="obs-tag" style="font-size:11px;opacity:0.55">${escapeHtml(a.observationsCrossRefLabel)}</span>`
    : '';
  // item 1.6 follow-up (La Corniche pass): a group here used to get the
  // `.appendix-group` class (paged.css, break-inside: avoid) whenever it
  // was at or under 6 findings (the removed APPENDIX_GROUP_KEEP_THRESHOLD
  // constant), on the reasoning that forcing a *large* group atomic would
  // blank most of a page. That reasoning didn't cover the actual failure
  // mode: a *small* group (well under the threshold) can still be taller
  // than one full
  // page's remaining space once long selectors and multi-page URL lists
  // are accounted for, and break-inside: avoid on a fragment taller than
  // a page gives Paged.js's layout algorithm no valid break point at all
  // - confirmed directly against a real report (sas-fernande.fr): it hit
  // Paged.js's own "Layout repeated" infinite-loop guard and failed
  // generation outright once item 1.6's page-count text change made one
  // small group just tall enough to cross that line. Every group now
  // flows freely, same as large groups already did (the class and its
  // CSS rule are removed, not just conditionally withheld); the per-row
  // `table tbody tr { break-inside: avoid }` rule (paged.css) still keeps
  // any single finding's own row from splitting mid-row, which is the
  // only atomicity guarantee that was ever actually safe to make.

  // item 2.4 (La Corniche pass): the severity badge and title used to be
  // two independent flex items in this row's flex-wrap:wrap layout, which
  // treats each item as a rigid box for line-breaking purposes - a long
  // title (target-size, alt-text-quality-heuristic) that didn't fit next
  // to the badge moved to its own line as a whole item, leaving the badge
  // alone on line 1 and pushing the rule-code badge to a third line.
  // Grouping badge+title into one non-flex inline wrapper lets ordinary
  // text-wrapping keep the badge adjacent to the title's first line -
  // only the title's own overflow text wraps, not the badge.
  return `
    <div style="margin-bottom:var(--space-4)">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
        <span style="display:inline">
          ${renderSeverityBadge(strings, group.severity)}
          <span style="font-size:14px;font-weight:500">${escapeHtml(representativeTitle)}</span>
        </span>
        <span class="mono rule-code" style="font-size:10px;opacity:0.5">${escapeHtml(ruleCodeDisplay)}</span>
        ${gloss}
        ${obsTag}
        ${vendorTag}
        <span style="font-size:11px;opacity:0.6">${renderRuleSum(strings, language, group)}</span>
      </div>
      <table style="${APPENDIX_TABLE_STYLE}">
        <colgroup>${APPENDIX_COLUMN_WIDTHS.map((w) => `<col style="width:${w}">`).join('')}</colgroup>
        <thead>
          <tr>
            ${headCell(a.findingIdColumnLabel, APPENDIX_COLUMN_WIDTHS[0])}
            ${headCell(a.pagesColumnLabel, APPENDIX_COLUMN_WIDTHS[1])}
            ${headCell(a.occurrencesColumnLabel, APPENDIX_COLUMN_WIDTHS[2])}
            ${headCell(a.selectorColumnLabel, APPENDIX_COLUMN_WIDTHS[3])}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      ${thirdPartyCrossRefNote}
    </div>
  `;
}

/** Geo findings never reach the curated themes section (Theme.category's
 *  locked schema has no 'geo' option - see CLAUDE.md trade-off 16), so
 *  this is the only place a reader sees geo business-impact context. The
 *  citation is quarantined with an "emerging" badge per the source
 *  research doc's Stage 3 recommendation - both curated geo stat rows
 *  are confidence:'emerging' today (8.5b's deliberate Princeton
 *  downgrade), so the badge is driven by that field, not hardcoded here. */
function renderGeoCitationBlock(
  strings: ReportStrings,
  language: ReportLanguage,
  sector: StatSector,
  /** B1: same shared, mutated-in-place Set themes.ts uses, so a
   *  statistic already cited on a theme card never repeats here (or vice
   *  versa) - one citation per statistic across the whole document. */
  citedStatIds: Set<string>,
): string {
  // P0.2 (2026-08-21 La Corniche feedback pass): same strictSector rule
  // as themes.ts's citation selection - omit rather than fall back to a
  // cross-sector geo stat.
  const top = selectReferenceStats('geo', sector, { strictSector: true }).find(
    (stat) => !citedStatIds.has(stat.id),
  );
  if (!top) return '';
  citedStatIds.add(top.id);
  return renderReferenceStatNote(
    strings.themes.impactCitationLabel,
    top,
    language,
    strings.findingsAppendix.geoEmergingLabel,
  );
}

/** item 1.4: groups every third-party finding (any category) under one
 *  block, vendor-labelled where a group's findings all resolve to the
 *  same known vendor - a group whose findings disagree on vendor (rare;
 *  groupAppendix keys on ruleId+severity, and a given rule id's third-
 *  party instances are consistently the same embed in practice) or match
 *  no known prefix falls back to the generic "unidentified" label,
 *  never silently to nothing. */
function renderThirdPartySection(
  strings: ReportStrings,
  language: ReportLanguage,
  thirdPartyFindings: Finding[],
  missingPercentByUrl: ReadonlyMap<string, number>,
  totalPagesScanned: number,
  clusterLookup: ClusterLookup,
): string {
  if (thirdPartyFindings.length === 0) return '';

  const groups = groupAppendix(thirdPartyFindings);
  const groupBlocks = groups
    .map((group) => {
      const isFullyDiverted = group.findings.every(
        (f) => classifyDiversion(f, missingPercentByUrl) !== null,
      );
      const vendors = new Set(
        group.findings.map(
          (f) => detectFindingVendor(f) ?? strings.findingsAppendix.unknownVendorLabel,
        ),
      );
      const vendorLabel =
        vendors.size === 1 ? [...vendors][0] : strings.findingsAppendix.unknownVendorLabel;
      return renderRuleGroup(
        strings,
        language,
        group,
        isFullyDiverted,
        totalPagesScanned,
        clusterLookup,
        vendorLabel,
      );
    })
    .join('');

  return `
    <div style="margin-bottom:var(--space-12)">
      <h4>${escapeHtml(strings.findingsAppendix.thirdPartyHeading)}</h4>
      <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-2);max-width:70ch">${escapeHtml(strings.findingsAppendix.thirdPartyIntro)}</p>
      <p style="font-size:11px;opacity:0.5;margin-bottom:var(--space-4);max-width:70ch">${escapeHtml(strings.findingsAppendix.thirdPartyCountedInTotalsNote)}</p>
      ${groupBlocks}
    </div>
  `;
}

function renderCategorySection(
  strings: ReportStrings,
  language: ReportLanguage,
  category: FindingCategory,
  categoryFindings: Finding[],
  missingPercentByUrl: ReadonlyMap<string, number>,
  sector: StatSector,
  citedStatIds: Set<string>,
  totalPagesScanned: number,
  clusterLookup: ClusterLookup,
  /** Fix #6: the same third-party partition renderFindingsAppendix already
   *  computed once (item 1.4), passed down so a first-party group can point
   *  to its own split-off third-party occurrences without a second pass
   *  over findings or a new partition rule. */
  thirdPartyFindings: Finding[],
): string {
  if (categoryFindings.length === 0) return '';

  // item 26: every severity groups and renders through the same full-
  // detail path now - see appendix-grouping.ts's groupAppendix comment.
  const groups = groupAppendix(categoryFindings);

  const groupBlocks = groups
    .map((group) => {
      const isFullyDiverted = group.findings.every(
        (f) => classifyDiversion(f, missingPercentByUrl) !== null,
      );
      const thirdPartyCrossRefCount = thirdPartyFindings.filter((f) =>
        group.memberRuleIds.includes(f.ruleId),
      ).length;
      return renderRuleGroup(
        strings,
        language,
        group,
        isFullyDiverted,
        totalPagesScanned,
        clusterLookup,
        undefined,
        thirdPartyCrossRefCount,
      );
    })
    .join('');
  // item 40: a travel-industry AI-usage statistic (Phocuswright, 56%)
  // used to render right under the section h4, ahead of every finding
  // row - reading as a section-wide headline stat rather than context
  // for the one minor finding it actually supports. Rendered after the
  // finding rows instead, so it reads as a footnote to what it's citing
  // rather than a lead-in the reader hits before any actual finding.
  // No wrapping opacity here: renderGeoCitationBlock's own
  // renderReferenceStatNote output already carries opacity:0.6 (matching
  // themes.ts's identically-styled legalRelevance note exactly, per that
  // function's own doc comment) - an outer opacity here used to compound
  // with it multiplicatively (0.8 * 0.6 = 0.48 effective), dropping the
  // text below WCAG 1.4.3's 4.5:1 minimum (measured 4.25:1). Caught by
  // paged-invariants.test.ts's axe pass once the stress fixture actually
  // exercised a geo finding, per the standing note in CLAUDE.md trade-off
  // 16 that this exact pairing had not been confirmed outside the real
  // sas-fernande.fr fixture, which never took this code path.
  const citationBlock =
    category === 'geo'
      ? `<div style="margin-top:var(--space-2)">${renderGeoCitationBlock(strings, language, sector, citedStatIds)}</div>`
      : '';

  return `
    <div style="margin-bottom:var(--space-12)">
      <h4 style="color:${CATEGORY[category].color}">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</h4>
      ${groupBlocks}
      ${citationBlock}
    </div>
  `;
}

export function renderFindingsAppendix(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  findings: Finding[],
  manifest: AuditManifest,
  sector: StatSector,
  /** B1: see themes.ts's renderThemes - same shared Set, passed through
   *  from render-html.ts so a statistic already cited on a theme card
   *  never repeats in the geo appendix section, and vice versa. Defaults
   *  to a fresh Set for callers (existing tests) that don't need
   *  cross-section dedupe. */
  citedStatIds: Set<string> = new Set(),
): string {
  const missingPercentByUrl = buildMissingPercentIndex(manifest);
  const clusterLookup = buildClusterLookup(manifest);

  // item 29: the list of crawled URLs was never printed anywhere - the
  // client had no way to verify the scope they paid for beyond a bare
  // count on the cover. Belongs here rather than a dedicated page (doc's
  // own acceptance check: "doesn't need its own full page"), and directly
  // supports item 25 (every finding's own page list can be cross-checked
  // against the full crawled set) and item 28 (confirms which pages were
  // actually explored). Also feeds item 3.1's "toutes les pages
  // analysées" collapse below: the same total used on the cover and in
  // methodology.
  const hasCurrentCoverage = manifest.pages.some((page) => page.analysisCoverage !== undefined);
  const crawledPages = manifest.pages
    .filter((page) => {
      if (!hasCurrentCoverage) return page.status === 'visited';
      const passes = page.analysisCoverage?.passes;
      return (
        passes !== undefined &&
        [passes.rendered, passes.axe, passes.extended].some(
          (pass) => pass.outcome === 'completed' || pass.outcome === 'partial',
        )
      );
    })
    .map((page) => page.url)
    .sort();
  const coverage = buildCoverageDisclosure(strings, manifest, language);

  // item 1.4: split once, up front, so every downstream section (the
  // four category listings plus the new third-party block) reads from
  // one consistent partition - a finding renders in exactly one place
  // either way, so the annex-row-count invariant (item 0.7) still holds.
  const thirdPartyFindings = findings.filter((finding) => isThirdPartyFinding(finding));
  const firstPartyFindings = findings.filter((finding) => !isThirdPartyFinding(finding));

  const sections = CATEGORY_ORDER.map((category) => {
    const categoryFindings = firstPartyFindings.filter((finding) => finding.category === category);
    return renderCategorySection(
      strings,
      language,
      category,
      categoryFindings,
      missingPercentByUrl,
      sector,
      citedStatIds,
      crawledPages.length,
      clusterLookup,
      thirdPartyFindings,
    );
  }).join('');
  const thirdPartySection = renderThirdPartySection(
    strings,
    language,
    thirdPartyFindings,
    missingPercentByUrl,
    crawledPages.length,
    clusterLookup,
  );

  // item D8 (P4): each category heading used its own colour with nothing
  // stating what the four colours mean - a reader had to notice the
  // pattern by paging through the whole annex. Only categories that
  // actually have findings appear, same "don't show what's empty"
  // reasoning as item D7's zero-count stat tiles.
  const presentCategories = CATEGORY_ORDER.filter((category) =>
    firstPartyFindings.some((f) => f.category === category),
  );
  const legend =
    presentCategories.length > 0
      ? `
        <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;font-size:11px;opacity:0.7;margin-bottom:var(--space-4)">
          ${presentCategories
            .map(
              (category) =>
                `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${CATEGORY[category].color}"></span>${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</span>`,
            )
            .join('')}
        </div>
      `
      : '';

  const crawledPagesBlock =
    crawledPages.length > 0
      ? `
        <div style="margin-bottom:var(--space-12)">
          <h4>${escapeHtml(fillTemplate(strings.findingsAppendix.crawledPagesHeadingTemplate, { count: crawledPages.length }))}</h4>
          <p class="url-cell" style="font-size:11px;opacity:0.65;max-width:none">${escapeHtml(crawledPages.join(', '))}</p>
        </div>
      `
      : '';

  return sheet(
    `
    ${renderSheetHeader(ordinal, strings.findingsAppendix.eyebrow, strings.findingsAppendix.heading, 'var(--space-2)')}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(strings.findingsAppendix.intro)}</p>
    <p style="font-size:11px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(
      [coverage.summary, ...coverage.details].join(' '),
    )}</p>
    ${legend}
    ${crawledPagesBlock}
    ${sections}
    ${thirdPartySection}
  `,
    'sheet-standalone',
    'section-12',
  );
}
