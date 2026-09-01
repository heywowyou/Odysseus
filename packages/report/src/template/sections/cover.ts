import type { AuditManifest, AuditManualFields, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatDate, sheet } from '../html-utils.js';
import { resolveGenericDecisionQuestion } from '../generic-question.js';
import { hasMeasuredCoreWebVitals } from './core-web-vitals-table.js';

/** Second identity fallback for the cover headline (plan 018 step 4:
 *  nomCommercial first, then the hostname, then the generic report title).
 *  Returns null when the stored site URL somehow does not parse, so the
 *  caller falls through to the report title instead of rendering a broken
 *  half-URL. Exported for the precedence tests. */
export function hostnameFromSiteUrl(siteUrl: string): string | null {
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return null;
  }
}

/** Cover layout ported from report.reference.html's COVER section: a
 *  centered kicker/title/question block over the radial-gradient ground
 *  (painted by the .sheet-cover class in paged.css), then a short accent
 *  rule and the report-type line plus the audit date and the Odysseus
 *  signature.
 *
 *  Minimal by contract (plan 018 step 4): the six-field grid, the risk
 *  scale, and the raisonSociale line moved off this page - audit facts and
 *  the legal identity belong to the metadata sheet (metadata-sheet.ts),
 *  which renders as the second physical page. raisonSociale must never sit
 *  above the trading name; the headline here is nomCommercial, falling back
 *  to the manifest hostname, then strings.cover.reportTitle.
 *
 *  The decision question comes from the shared resolver
 *  (../generic-question.ts), never a local literal - plan 018 step 5 makes
 *  report-intro.ts render the exact same bytes, and plan 019 replaces the
 *  generic question by extending that one resolver's input.
 *
 *  One deliberate deviation from the reference markup: its 0.14em/0.08em
 *  uppercase tracking renders here at 0.02em, the value
 *  letter-spacing.test.ts established as safe against Chromium's
 *  print-to-PDF text-run splitting (item 6) and scans this file to
 *  enforce.
 *
 *  The hidden `.footer-source` node (feeds paged.css's `string-set`, see
 *  render-html.ts) lives inside this section, not as a preceding sibling
 *  of the whole document flow: CSS Paged Media forces an implicit page
 *  break whenever the page selector changes between two boxes, and
 *  `.sheet-cover` requests the named `cover` page while every other sheet
 *  uses the default `@page`. A `.footer-source` node placed before the
 *  cover therefore sat on the default page by itself, pushing the
 *  cover's own content onto page 2 - confirmed against a real render, not
 *  a hypothetical. Placing it as the cover's own first child keeps it on
 *  the same named page from the start, so no such transition ever
 *  happens. */
export function renderCover(
  strings: ReportStrings,
  manifest: AuditManifest,
  analysis: StoredAnalysis,
  // The minimal cover no longer consumes findings (the risk scale moved to
  // the metadata sheet), but the parameter stays so renderBody's positional
  // call and every existing test call keep their shape in this slice.
  findings: readonly Finding[] = [],
  manualFields?: AuditManualFields,
): string {
  // Manual-input-layer milestone, rule 5: every field absent must produce
  // a correctly rendering report - the headline identity falls through
  // nomCommercial, then the hostname, then the fixed report title, and the
  // page renders complete with none of them confirmed.
  const nomCommercial = manualFields?.nomCommercial?.value;
  const headline =
    nomCommercial ?? hostnameFromSiteUrl(manifest.siteUrl) ?? strings.cover.reportTitle;
  // item 3.8/0.3 reasoning carried over from the old referential field:
  // all four categories are always audited, but Performance is the one
  // category a scanner-level Lighthouse failure can remove for a whole
  // run, so it drops from this line when nothing was measured.
  const reportType = hasMeasuredCoreWebVitals(manifest)
    ? strings.cover.reportType
    : strings.cover.reportTypeNoPerformance;

  return sheet(
    `
    <div class="footer-source">${escapeHtml(strings.footer.confidentialityLabel.toUpperCase())} &middot; ${escapeHtml(manifest.siteUrl)}</div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:var(--space-4)">
      <div style="font-size:11px;letter-spacing:0.02em;text-transform:uppercase;color:var(--color-accent-200)">${escapeHtml(strings.cover.kicker)}</div>
      <h1 style="font-size:52px;max-width:13ch;margin:0">${escapeHtml(headline)}</h1>
      <div style="font-size:17px;opacity:0.8;max-width:38ch">${escapeHtml(resolveGenericDecisionQuestion(analysis.language))}</div>
    </div>
    <div>
      <div style="height:1px;background:linear-gradient(to right,var(--color-accent) 0,var(--color-accent) 120px,transparent 120px);margin-bottom:var(--space-8)"></div>
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--space-2)">
        <div style="font-size:13px;text-transform:uppercase;letter-spacing:0.02em;opacity:0.7">${escapeHtml(reportType)}</div>
        <div style="font-size:13px;opacity:0.5">${escapeHtml(formatDate(new Date(manifest.startedAt), analysis.language))} &middot; Odysseus</div>
      </div>
    </div>
  `,
    'sheet-cover',
  );
}
