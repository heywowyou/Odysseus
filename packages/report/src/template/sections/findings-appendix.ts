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
import { contentCheckedPageUrls, selectReferenceStats } from '@odysseus/core';
import { buildMissingPercentIndex, classifyDiversion } from '@odysseus/llm';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatAndNMore,
  formatNumber,
  labelSeparator,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { VERBATIM_EVIDENCE_ATTRIBUTE } from '../render-lint.js';
import { printableSelector } from '../printable-selector.js';
import { renderSeverityBadge } from '../severity-badge.js';
import { CATEGORY, CATEGORY_ORDER } from '../design-tokens.js';
import { sectionTitle } from '../section-registry.js';
import { renderReferenceStatNote } from '../reference-stat-note.js';
import { groupAppendix, type RuleGroup } from '../appendix-grouping.js';
import { resolveFindingDisplayLabel, RULE_TRANSLATIONS_FR } from '../rule-translations.js';
import {
  detectFindingVendor,
  isConfinedToThirdPartyFrame,
  isThirdPartyFinding,
} from '../third-party-attribution.js';

function renderRuleSum(strings: ReportStrings, language: ReportLanguage, group: RuleGroup): string {
  const a = strings.findingsAppendix;
  const parts = [
    `${formatNumber(group.findings.length, language)} ${pluralize(language, group.findings.length, a.findingSingular, a.findingPlural)}`,
    `${formatNumber(group.totalOccurrences, language)} ${pluralize(language, group.totalOccurrences, a.occurrenceSingular, a.occurrencePlural)}`,
    // item 1.6: no longer "jusqu'à N pages" ("up to") - group.pages is now
    // a real union across every finding's own pageUrls, not the largest
    // single finding's page count, so it is an exact figure, not an
    // upper bound. Kept a plain "N pages" instead of introducing a
    // denominator ("N sur M", matching the priority card's own wording)
    // since this group can span more rule ids than any one priority card
    // does (rule-family clustering, item 1.3) and a borrowed "sur M" here
    // would need its own explanation. Issue #291: the union itself is now
    // confined to the visited scope at the groupAppendix call sites, so
    // the figure can never exceed the analysed-page total.
    // A group whose every cited page sits outside the analysed scope - a
    // finding attributed to a redirect interstitial, say - confines to
    // zero here (issue #291 keeps that confinement), and the line read
    // "1 constat · 1 occurrence · 0 page" directly above a row listing
    // that page. The segment is dropped instead of printing a zero the
    // rows contradict.
    ...(group.pages > 0
      ? [
          `${formatNumber(group.pages, language)} ${pluralize(language, group.pages, a.pageSingular, a.pagePlural)}`,
        ]
      : []),
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
 *  colspan="4" row, which declares no column widths at all. The colgroup
 *  below is what actually pins the columns, since it applies to the table
 *  regardless of which row leads the fragment. Since issue #45 every
 *  finding row IS a full-width colspan="4" row (one atomic row per finding,
 *  see renderSubTableRow), so the colgroup is the only table-level width
 *  declaration that still reaches every fragment; each row repeats the
 *  widths on its own internal grid so its four columns keep the header's
 *  proportions wherever the fragment lands. */
const APPENDIX_COLUMN_WIDTHS = ['80px', '90px', '100px', 'auto'] as const;

function headCell(label: string, width: string): string {
  return `<th style="width:${width};padding:6px var(--space-2);font-size:10px;letter-spacing:0.02em;text-transform:uppercase;text-align:left;font-weight:400;color:color-mix(in srgb, var(--color-text) 55%, transparent);border-bottom:1px solid var(--color-divider);white-space:nowrap">${escapeHtml(label)}</th>`;
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
  /** The row's own page figure, already confined to the analysed scope.
   *  The "all analysed pages" collapse below compares against it rather
   *  than the raw URL count, so the collapsed line and the figure printed
   *  beside it can never disagree - a real report's row read 518 above a
   *  list claiming "Toutes les pages analysées (520)". */
  inScopePageCount: number,
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
    // The collapse claims the finding covers the whole analysed scope, so
    // it now also requires the in-scope figure the row prints to say the
    // same: a real report's row read 518 above a list claiming "Toutes
    // les pages analysées (520)", because two of the finding's URLs sit
    // outside that scope. Issue #291's case - a finding citing extra
    // pages the crawl never analysed - keeps its full URL list for the
    // same reason.
    if (
      totalPagesScanned > 0 &&
      inScopePageCount === totalPagesScanned &&
      finding.pageUrls.length === totalPagesScanned
    ) {
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

  // Issue #45: this line lives INSIDE the finding's own <tr> (see
  // renderSubTableRow), as a full-width line under the row's four-column
  // grid - the old separate continuation <tr> could be stranded alone at
  // the top of a page, opening 15 of 26 pages of a real delivered PDF
  // mid-row with no finding id, rule or column header in sight.
  // Issue #408: the URLs are the audited site's own, quoted verbatim, and
  // they kept tripping prose rules written for prose this renderer composed -
  // a query string read as a placeholder before a unit, a path segment
  // wrapped in underscores read as emphasis. Each one was fixed by widening
  // a regex against text that should never have been scanned as prose. The
  // label prefix IS renderer-composed, so it stays outside the marked span
  // and stays scanned.
  return `<div class="url-cell" style="padding-top:6px;font-size:10.5px;opacity:0.6">${escapeHtml(a.pagesColumnLabel)}${labelSeparator(language)}<span ${VERBATIM_EVIDENCE_ATTRIBUTE}>${escapeHtml(urlsText)}</span></div>`;
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
 *  Issue #318: the query string is dropped too. A real report listed the
 *  same script three times, differing only by a cache-busting
 *  `?v=2026-09-15-23-33-08`, and a query is never what tells a developer
 *  which file to fix. Dropping it also keeps credential-shaped parameters
 *  (a Google Maps tile's `key=`) out of this client-forwardable PDF, which
 *  used to need its own stripping step. */
function resourceDisplayPath(url: string): string {
  try {
    return capResourcePath(new URL(url).pathname);
  } catch {
    return capResourcePath(url.split(/[?#]/)[0] ?? url);
  }
}

/** The distinct files a resource list names, once query strings are gone,
 *  in the list's own order. The row's file count reads this too, so the
 *  count and the printed list never disagree. */
function distinctResourcePaths(urls: readonly string[]): string[] {
  return [...new Set(urls.map(resourceDisplayPath))];
}

/** Issue #276: a very long entry stayed one unbreakable token inside the
 *  appendix table and aborted the paid PDF, so a long path is shortened.
 *  Issue #318: the cut used to fall in the middle of the string, which
 *  could remove the file name itself ("j….min.js"), the one part that
 *  identifies the file. The file name is now always kept whole and only
 *  the directories before it are elided. */
const RESOURCE_PATH_DISPLAY_MAX = 90;

function capResourcePath(value: string): string {
  if (value.length <= RESOURCE_PATH_DISPLAY_MAX) return value;
  const fileName = value.slice(value.lastIndexOf('/') + 1);
  const headLength = Math.max(RESOURCE_PATH_DISPLAY_MAX - fileName.length - 2, 1);
  return `${value.slice(0, headLength)}…/${fileName}`;
}

function renderResourceUrlList(
  strings: ReportStrings,
  language: ReportLanguage,
  finding: Finding,
): string {
  const collapsed = findingResourceUrls(finding);
  const fromElements = collapsed.length === 0;
  const urls = distinctResourcePaths(
    collapsed.length > 0 ? collapsed : elementResourceUrls(finding),
  );
  if (urls.length === 0) return '';
  const a = strings.findingsAppendix;

  // mergeGroup stores at most MAX_ELEMENTS_PER_FINDING occurrences, so an
  // element-derived list on a finding with more occurrences than that is a
  // sample and the true number of distinct files is genuinely unknown. Say
  // "examples" and print no remainder rather than compute an "et N autres"
  // against a set we know is truncated - a wrong count is worse than no
  // count, the same reasoning the cover uses for an unconfirmed name.
  const truncated = fromElements && finding.elements.length < finding.occurrences;

  const shown = urls.slice(0, RESOURCE_URL_LIST_CAP);
  const remaining = urls.length - shown.length;
  const text =
    remaining > 0 && !truncated
      ? `${shown.join(', ')} ${formatAndNMore(remaining, language, a)}`
      : shown.join(', ');
  const label = truncated ? a.affectedFilesSampleLabel : a.affectedFilesLabel;

  // Issue #45: rendered inside the finding's own atomic <tr>, like the
  // pages line above (see renderSubTableRow).
  // Issue #408, same reasoning as the pages line above: file paths captured
  // from the site are evidence, the label is prose.
  return `<div class="url-cell" style="padding-top:6px;font-size:10.5px;opacity:0.6">${escapeHtml(label)}${labelSeparator(language)}<span ${VERBATIM_EVIDENCE_ATTRIBUTE}>${escapeHtml(text)}</span></div>`;
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
  return `font-family:var(--font-mono);overflow-wrap:anywhere;word-break:normal;hyphens:none;opacity:0.8;font-size:${fontSize}`;
}

/** Issue #45: one finding is ONE table row. The data cells and the
 *  "Fichiers :" / "Pages :" continuation lines used to be separate <tr>
 *  siblings kept together only by CSS hints (break-inside:avoid on each
 *  row, plus .appendix-url-row's break-before:avoid), and a real delivered
 *  PDF proved those hints do not hold in Paged.js fragmentation: 15 of 26
 *  appendix pages opened mid-row, on a bare orphaned continuation line
 *  ("Pages : Mêmes pages que f006") or a selector whose finding id, rule
 *  and severity sat pages earlier - in the annex explicitly labelled
 *  "À transmettre à votre prestataire technique".
 *
 *  The whole finding now renders as a single <tr> whose one colspan="4"
 *  cell contains the four-column grid (same widths as the colgroup, so
 *  the columns still line up with the header row) followed by the
 *  continuation lines. paged.css's `table tbody tr { break-inside: avoid }`
 *  then keeps id, page count, occurrences, selector, files and pages
 *  together as one atomic unit - and stays inside its inline duplicate on
 *  the row itself, so the guarantee is declared where the rows are built.
 *
 *  This is bounded per-row atomicity, exactly what trade-off 17 allows: a
 *  single finding's height is bounded by its selector, its capped 8-file
 *  list and its capped 5-URL list. It is deliberately NOT group-level
 *  break-inside:avoid (a rule group's rendered height is unbounded, and
 *  the removed .appendix-group/.row-atomic wrappers triggered Paged.js's
 *  "Layout repeated" infinite-loop guard on real reports), and
 *  deliberately NOT the old display:contents `.row-atomic` div trick:
 *  these are real <tr> elements, the fragmentation unit Paged.js handles
 *  reliably (see the 2026-08-24 comment above). */
function renderSubTableRow(
  strings: ReportStrings,
  language: ReportLanguage,
  finding: Finding,
  totalPagesScanned: number,
  samePagesAsFindingId: string | undefined,
  clusterLookup: ClusterLookup,
  /** Issue #291: the analysed (visited-scope) page set this row's own
   *  "N pages" cell counts against. */
  scopePageUrls: ReadonlySet<string>,
): string {
  // B4: a site-wide resource finding has no meaningful single selector -
  // its detail is the file list rendered below, so the column states how
  // many files rather than naming an arbitrary one of their DOM nodes.
  const resourceUrls = distinctResourcePaths(findingResourceUrls(finding));
  const selector =
    resourceUrls.length > 0
      ? fillTemplate(
          pluralize(
            language,
            resourceUrls.length,
            strings.findingsAppendix.affectedFilesCountSingularTemplate,
            strings.findingsAppendix.affectedFilesCountTemplate,
          ),
          { count: formatNumber(resourceUrls.length, language) },
        )
      : printableSelector(finding.elements[0]?.selector ?? '');
  // Issue #291: the row's page figure counts distinct visited-scope pages.
  // The "Pages :" URL list underneath still prints every recorded URL -
  // the item 25 detail promise covers URLs, not counts - but the figure
  // can no longer exceed the analysed-page total (a real report showed a
  // finding row claiming 24 pages against a 140-page analysed scope that
  // included discovered-but-not-scanned pages and post-merge language
  // variants).
  // A finding can cite only pages outside that scope - a http:// home page
  // that redirects, an error page - and the row then printed "0" directly
  // above the URL list naming those pages. It falls back to the pages it
  // lists, which keeps the figure and the list describing the same thing.
  const inScopePageCount =
    finding.pageUrls.filter((url) => scopePageUrls.has(url)).length || finding.pageUrls.length;
  return `
    <tr id="annexref-${escapeHtml(finding.findingId)}" style="break-inside:avoid">
      <td colspan="4" style="padding:6px var(--space-2);border-bottom:1px solid var(--color-divider)">
        <div style="display:grid;grid-template-columns:${APPENDIX_COLUMN_WIDTHS.join(' ')}">
          <div style="font-family:var(--font-mono);white-space:nowrap">${escapeHtml(finding.findingId)}</div>
          <div>${formatNumber(inScopePageCount, language)}</div>
          <div>${formatNumber(finding.occurrences, language)}</div>
          <div ${VERBATIM_EVIDENCE_ATTRIBUTE} style="${selectorCellStyle(selector)}">${escapeHtml(selector)}</div>
        </div>${renderResourceUrlList(strings, language, finding)}${renderPageUrlList(strings, language, finding, totalPagesScanned, inScopePageCount, samePagesAsFindingId, clusterLookup)}
      </td>
    </tr>
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
  /** Issue #291: the analysed (visited-scope) page set every page figure in
   *  this group is confined to (the group sum via groupAppendix, and each
   *  finding row's own count). Declared before the optional count below so
   *  a required parameter never trails an optional one. */
  scopePageUrls: ReadonlySet<string>,
  /** The annex block this group renders in: its finding category, or
   *  'third-party'. Part of the group's layout identity below. */
  partition: string,
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
          fillTemplate(
            pluralize(
              language,
              thirdPartyCrossRefCount,
              a.splitGroupThirdPartyNoteSingularTemplate,
              a.splitGroupThirdPartyNoteTemplate,
            ),
            {
              count: formatNumber(thirdPartyCrossRefCount, language),
              thirdPartyHeading: a.thirdPartyHeading,
            },
          ),
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
  // Issue #319: the gloss span used to start with a literal "- " separator.
  // In this flex header it lands on its own wrap line whenever the title,
  // badge and rule code fill the row, so a full sentence like "Des boutons
  // ou liens trop petits..." opened with a stray hyphen, reading as a
  // bullet before prose it does not introduce. The flex gap already
  // separates it from the rule code, so the separator is removed, not
  // restyled.
  const gloss = translation
    ? `<span style="font-size:10px;opacity:0.5">${escapeHtml(translation.gloss)}</span>`
    : '';
  const ruleCodeDisplay = group.ruleId;
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
        scopePageUrls,
      );
    })
    .join('');
  const obsTag = isFullyDiverted
    ? `<span class="obs-tag" style="font-size:11px;opacity:0.55">${escapeHtml(fillTemplate(a.observationsCrossRefLabel, { section: sectionTitle('section-06', strings) }))}</span>`
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
  //
  // Issue #45, second half - the column header used to never repeat when a
  // rule group's rows continued onto a new page, and this file cannot fix
  // that alone: the `table thead { display: table-header-group }` rule in
  // paged.css does not get honoured by Paged.js 0.4.3 (confirmed against a
  // real 38-page report, paged.css's D3 comment) - repeating the header
  // needs an engine-level handler in the render pipeline. What this file
  // contributes is the `data-appendix-rule-id` marker on the table above:
  // Paged.js clones the whole `<table>` element (attributes intact) into
  // each page fragment it splits a group across, so pdf.ts can find every
  // fragment belonging to the same rule group after layout and, if a
  // fragment lost its `<thead>`, clone the header back in from the first
  // fragment and re-paginate once.
  //
  // Issue #172, resolved by #179: this thead used to carry an inline
  // break-after:avoid that was measured load-bearing - the #45 repair loop
  // only converged on a split rule group while it was present (5/5 with,
  // 5/5 deterministic failures without) - but through no mechanism anyone
  // could name. It was not a keep-with-next: Paged.js only learns
  // break-before/break-after from stylesheet declarations its breaks module
  // parses (stamping data-previous-break-after attributes the chunker acts
  // on), an inline style never passes that parser, and the stylesheet
  // equivalent `table[data-appendix-rule-id] thead { break-after: avoid }`
  // was measured (2026-09-11, 30-row synthetic rule group through the real
  // pipeline) to stamp the attribute on the table's tbody while changing
  // the paginated output not at all - the chunker splits tables between
  // rows and never proposes the thead/tbody boundary as a break point. The
  // divergence appeared only during pagination - pre-pagination geometry
  // was byte-identical and Paged.js never reads thead computed styles - so
  // the lever was Chromium-side, undocumented, and one browser upgrade
  // away from silently disappearing. The reliance is now gone by
  // construction: the repair's own source patch marks each reopened table
  // data-appendix-continuation and a stylesheet break-before: page
  // (pdf.ts, insertRepeatedTheadsIntoHtml) makes it open at a page top
  // with its rows under its header, so convergence is structural. The
  // inline declaration is therefore removed, and the guarantee a reader
  // actually cares about - a header never prints stranded alone at a page
  // bottom - comes from pdf.ts's post-layout work: the repair
  // re-pagination followed by removeEmptyAppendixTableGhosts, which
  // deletes any header-only table fragment once layout has settled.
  // Splitting each group into one table per
  // page-worth of rows cannot work either: sheet layout is decided by
  // Paged.js at render time, and a hand-split table would just break at
  // different, equally arbitrary points. What this file also does, since
  // the atomic-row change above, is make sure a continuation page can only
  // ever open on a complete finding row, so the reader paging back needs
  // to find the row's own id, never a fragment.
  // Issue #170: this wrapper and its heading are the units whose pagination
  // pdf.ts defends. Both carry the group's data-appendix-rule-id so the
  // render pipeline can detect a heading that Paged.js left stranded at a
  // page bottom (its table moved wholly to the next page) and relocate the
  // group's start to a fresh page with an injected break-before: page rule
  // for this wrapper - see the stranded-heading repair in pdf.ts and
  // paged.css's issue #170 note for why no CSS-only keep-with-next can hold
  // here. The attribute mirrors the table below, whose own
  // data-appendix-rule-id the thead-repair pass already keys on.
  // Despite the attribute's name, its value identifies the GROUP, not the
  // rule: one rule id heads several groups (one per severity, and again in
  // the third-party block or another category), and every repair keys on
  // this value. With a bare rule id, repairing one stranded group forced
  // every same-id group onto a fresh page, and a category whose first group
  // shared the id was left with its heading alone at a page foot, which
  // issue #303's gate refuses to ship.
  const groupId = escapeHtml(`${partition}--${group.ruleId}--${group.severity}`);
  return `
    <div class="appendix-rule-group" data-appendix-rule-id="${groupId}" style="margin-bottom:var(--space-4)">
      <div class="appendix-rule-head" data-appendix-rule-id="${groupId}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
        <span style="display:inline">
          ${renderSeverityBadge(strings, group.severity)}
          <span style="font-size:14px;font-weight:500">${escapeHtml(representativeTitle)}</span>
        </span>
        <span class="mono rule-code" style="font-size:10px;opacity:0.5">${escapeHtml(ruleCodeDisplay)}</span>
        ${gloss}
        ${vendorTag}
        <span style="font-size:11px;opacity:0.6">${renderRuleSum(strings, language, group)}</span>
        ${obsTag}
      </div>
      <table style="${APPENDIX_TABLE_STYLE}" data-appendix-rule-id="${groupId}">
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

/** Geo findings never reach the curated themes section (StoredTheme.category's
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
  scopePageUrls: ReadonlySet<string>,
): string {
  if (thirdPartyFindings.length === 0) return '';

  const groups = groupAppendix(thirdPartyFindings, scopePageUrls);
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
        scopePageUrls,
        'third-party',
        vendorLabel,
      );
    })
    .join('');

  // Q1 keeps frame-confined findings out of the headline totals, so the
  // totals note must say which of this section's findings are counted.
  const confinedCount = thirdPartyFindings.filter(isConfinedToThirdPartyFrame).length;
  const totalsNote =
    confinedCount === 0
      ? strings.findingsAppendix.thirdPartyCountedInTotalsNote
      : confinedCount === thirdPartyFindings.length
        ? strings.findingsAppendix.thirdPartyFramesExcludedNote
        : strings.findingsAppendix.thirdPartyMixedTotalsNote;

  // Issue #303: same hooks as a category block below, for the same repair.
  return `
    <div class="appendix-category" data-appendix-category="third-party" style="margin-bottom:var(--space-12)">
      <h4 class="appendix-category-head" data-appendix-category="third-party">${escapeHtml(strings.findingsAppendix.thirdPartyHeading)}</h4>
      <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-2)">${escapeHtml(strings.findingsAppendix.thirdPartyIntro)}</p>
      <p style="font-size:11px;opacity:0.5;margin-bottom:var(--space-4)">${escapeHtml(totalsNote)}</p>
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
  /** Issue #291: the analysed (visited-scope) page set every page figure in
   *  this category's groups is confined to. */
  scopePageUrls: ReadonlySet<string>,
): string {
  if (categoryFindings.length === 0) return '';

  // item 26: every severity groups and renders through the same full-
  // detail path now - see appendix-grouping.ts's groupAppendix comment.
  const groups = groupAppendix(categoryFindings, scopePageUrls);

  const groupBlocks = groups
    .map((group) => {
      const isFullyDiverted = group.findings.every(
        (f) => classifyDiversion(f, missingPercentByUrl) !== null,
      );
      const thirdPartyCrossRefCount = thirdPartyFindings.filter(
        (f) => f.ruleId === group.ruleId,
      ).length;
      return renderRuleGroup(
        strings,
        language,
        group,
        isFullyDiverted,
        totalPagesScanned,
        clusterLookup,
        scopePageUrls,
        category,
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

  // Issue #303: a real report printed "Référencement (SEO)", "Rendu" and
  // "Visibilité dans les moteurs d'IA (GEO)" as the last line of a page
  // with the category's first rule group starting on the next one. The
  // class and data attribute are what pdf.ts's repair targets - a CSS
  // keep-with-next cannot hold here for exactly the reasons issue #170's
  // note in that file records, and this is the same defect one level up
  // from the rule-group heading that note is about.
  return `
    <div class="appendix-category" data-appendix-category="${escapeHtml(category)}" style="margin-bottom:var(--space-12)">
      <h4 class="appendix-category-head" data-appendix-category="${escapeHtml(category)}" data-report-category="${escapeHtml(category)}" style="color:${CATEGORY[category].color}">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</h4>
      ${groupBlocks}
      ${citationBlock}
    </div>
  `;
}

/** Issue #318: the analysed pages used to print as one comma-separated
 *  block that ran across almost two pages for a 140-page site. They are now
 *  one path per line, in columns, grouped by the first path segment (which
 *  is the language or the site section on the sites audited so far). A
 *  segment with a single page joins the top-level group rather than getting
 *  a heading of its own. Pages on another host keep their full address. */
function renderCrawledPageGroups(pageUrls: readonly string[]): string {
  const hostCounts = new Map<string, number>();
  const parsed = pageUrls.map((url) => {
    try {
      const u = new URL(url);
      hostCounts.set(u.host, (hostCounts.get(u.host) ?? 0) + 1);
      return { url, host: u.host, path: `${u.pathname}${u.search}` };
    } catch {
      return { url, host: undefined, path: url };
    }
  });
  const mainHost = [...hostCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const entries = parsed.map((page) => {
    const onMainHost = page.host !== undefined && page.host === mainHost;
    const display = onMainHost ? page.path : page.url;
    const segment = onMainHost ? (page.path.split('/')[1] ?? '').split('?')[0]! : '';
    return { display, segment };
  });
  const segmentCounts = new Map<string, number>();
  for (const { segment } of entries) {
    segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
  }
  const groups = new Map<string, string[]>();
  for (const { display, segment } of entries) {
    const key = segment !== '' && (segmentCounts.get(segment) ?? 0) > 1 ? `/${segment}/` : '/';
    groups.set(key, [...(groups.get(key) ?? []), display]);
  }
  const orderedKeys = [...groups.keys()].sort((a, b) =>
    a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b),
  );
  const showHeadings = orderedKeys.length > 1;
  return orderedKeys
    .map((key) => {
      const items = (groups.get(key) ?? [])
        // Issue #408: each <li> is marked rather than the <ul>, because the
        // stripper's marked-element pattern matches only an element's own
        // text and deliberately cannot span nested tags - that is what keeps
        // a marker from ever hiding template markup.
        .map(
          (display) =>
            `<li style="break-inside:avoid" ${VERBATIM_EVIDENCE_ATTRIBUTE}>${escapeHtml(display)}</li>`,
        )
        .join('');
      const heading = showHeadings
        ? `<p class="mono" style="font-size:10px;font-weight:600;opacity:0.8;margin:var(--space-2) 0 2px">${escapeHtml(key)}</p>`
        : '';
      return `<div class="crawled-page-group">${heading}<ul class="url-cell" style="list-style:none;padding:0;margin:0;columns:2;column-gap:var(--space-6);font-size:10px;line-height:1.45;opacity:0.65;max-width:none">${items}</ul></div>`;
    })
    .join('');
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

  // Issue #291: the analysed (visited-scope) page set every page figure in
  // this annex is confined to - the group sums and each finding row's own
  // page count. Findings record every real URL (language variants kept
  // after a translation-cluster merge, and origin-level findings citing
  // discovered-but-not-scanned pages), so an unconfined union claimed 206
  // pages against a 140-page analysed scope in a real report. Same
  // population buildRenderedPriorities, checklist.ts and themes.ts count
  // against.
  // Issue #80's content-checked population, not the raw visited set: the
  // metadata sheet, the statistics tile and the methodology paragraph all
  // call the analysed perimeter by the content-checked figure, so a page
  // figure built on the visited set could exceed the perimeter the report
  // states it analysed - a real French report opened on "au moins 522
  // pages du périmètre analysé" three pages after "520 pages analysées".
  const scopePageUrls = contentCheckedPageUrls(manifest);

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
      scopePageUrls,
    );
  }).join('');
  const thirdPartySection = renderThirdPartySection(
    strings,
    language,
    thirdPartyFindings,
    missingPercentByUrl,
    crawledPages.length,
    clusterLookup,
    scopePageUrls,
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
                `<span style="display:inline-flex;align-items:center;gap:5px"><span class="report-category-swatch" data-report-category="${category}" style="width:8px;height:8px;border-radius:50%;background:${CATEGORY[category].color}"></span><span data-report-category="${category}">${escapeHtml(strings.findingsAppendix.categoryLabels[category])}</span></span>`,
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
          ${renderCrawledPageGroups(crawledPages)}
        </div>
      `
      : '';

  return sheet(
    `
    ${renderSheetHeader(ordinal, strings.findingsAppendix.eyebrow, strings.findingsAppendix.heading, 'var(--space-2)')}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-4)">${escapeHtml(strings.findingsAppendix.intro)}</p>
    ${legend}
    ${crawledPagesBlock}
    ${sections}
    ${thirdPartySection}
  `,
    'sheet-standalone',
    'section-12',
  );
}
