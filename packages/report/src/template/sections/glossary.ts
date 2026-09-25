import { HEURISTIC_RULE_IDS, type Finding, type ObligationAssessment } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSheetHeader, sheet } from '../html-utils.js';
import { isArticle47Regime } from './accessibility-statement.js';

const CORE_WEB_VITALS_TERM_IDS = new Set(['lcp', 'fcp', 'tbt', 'cls', 'speed-index']);

export interface GlossaryContext {
  findings: readonly Finding[];
  obligationAssessment: ObligationAssessment | undefined;
  /** manifest.siteSignals?.hasTransactionalFlow !== undefined - the
   *  transactional-flow question was actually evaluated for this scan,
   *  regardless of the answer, so the term used to state that (section
   *  02) is relevant either way. */
  transactionalFlowEvaluated: boolean;
  /** hasMeasuredCoreWebVitals(manifest) - the five Core Web Vitals terms
   *  used to be always-included, defining LCP/FCP/TBT/CLS/Speed Index for
   *  a performance section that has zero content when Lighthouse failed
   *  on every page (P0.1, 2026-08-21 La Corniche feedback pass). */
  hasMeasuredCoreWebVitals: boolean;
  /** Issue #330: the visible text of every section rendered before the
   *  glossary (htmlToText). The Haaitza report used hreflang 13 times,
   *  "balise canonique" 9 times and Lighthouse 10 times, and defined none
   *  of them. Terms in TEXT_GATED_TERMS are defined exactly when this text
   *  uses them, so the glossary follows the rendered report rather than a
   *  hand-kept guess about which sections mention what. */
  reportText: string;
}

/** Issue #330: terms defined only when the rendered report uses them.
 *  Patterns match the French and English wording alike. `axe` alone is
 *  also a common French noun, so only the engine's full name counts. */
const TEXT_GATED_TERMS: Readonly<Record<string, RegExp>> = {
  hreflang: /\bhreflang\b/i,
  noindex: /\bnoindex\b/i,
  canonical: /\bcanoni(?:que|cal)\b/i,
  lighthouse: /\bLighthouse\b/,
  crux: /\bChrome UX Report\b/,
  inp: /\bINP\b/,
  'open-graph': /\bOpen Graph\b/,
  'json-ld': /\bJSON-LD\b/,
  'axe-core': /\baxe-core\b/,
  // Plan 075: an overseas-domain report cites no regime, authority or
  // registry, and defining them there ("l'autorité citée dans ce rapport")
  // stated something the report does not say.
  eaa: /\bEAA\b/,
  dgccrf: /\bDGCCRF\b/,
  sirene: /\bSirene\b/,
  // The label prints only beside a statistic flagged as emerging, not with
  // every GEO finding: a hotel report defined it without ever using it.
  'recherche-emergente': /Recherche émergente|Emerging research/,
};

/** Visible text of rendered report HTML: tags dropped, the handful of
 *  entities escapeHtml produces decoded. Good enough to ask "does the
 *  report say this word", which is all the glossary needs. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** item 33: whether each conditional glossary term id is relevant to a
 *  given report - the 9-term static list previously defined RGAA even on
 *  an EAA-route report that never mentions it (item 19 stops that
 *  section from rendering at all) and omitted every performance-metric
 *  abbreviation and GEO/SEO term the report does use. Terms not listed
 *  here are always included (the severity vocabulary, WCAG/EAA/EN 301 549,
 *  and the constat/occurrence/sélecteur/DGCCRF terms every report's
 *  stats, appendix, and legal sections reference unconditionally). The
 *  five Core Web Vitals terms are handled below, gated on
 *  hasMeasuredCoreWebVitals rather than falling through to the default. */
function isGlossaryTermRelevant(id: string, ctx: GlossaryContext): boolean {
  const textPattern = TEXT_GATED_TERMS[id];
  if (textPattern) return textPattern.test(ctx.reportText);
  switch (id) {
    // Issue #330: the report can cite RGAA outside the article 47 route
    // (the conformance table names it), so a mention defines it too.
    case 'rgaa':
      return isArticle47Regime(ctx.obligationAssessment) || /\bRGAA\b/.test(ctx.reportText);
    case 'seo':
      return ctx.findings.some((f) => f.category === 'seo');
    case 'geo':
      return ctx.findings.some((f) => f.category === 'geo');
    case 'parcours-transactionnel':
      return (
        ctx.transactionalFlowEvaluated &&
        /parcours transactionnel|transactional flow/i.test(ctx.reportText)
      );
    // item 3.5 (v2 pass): 8 terms confirmed missing that a report can
    // actually use. Two of the eight ('signaux-a-verifier',
    // 'recherche-emergente') only ever appear alongside a specific kind
    // of finding, so they get the same scoped-relevance treatment as
    // rgaa/seo/geo/parcours-transactionnel above rather than always
    // showing. 'pages-concernees', 'sans-objet', 'rendu', 'sirene',
    // 'effort', and 'impact-commercial' fall through to the default
    // (always included) - each is near-universal in a full-tier report
    // and has no single cheap ctx signal to gate on, the same reasoning
    // already applied to wcag/eaa/en301549/the severity vocabulary/the
    // five Core Web Vitals/constat-vs-occurrence/selecteur/dgccrf.
    case 'signaux-a-verifier':
      return ctx.findings.some((f) => HEURISTIC_RULE_IDS.has(f.ruleId));
    default:
      if (CORE_WEB_VITALS_TERM_IDS.has(id)) {
        return ctx.hasMeasuredCoreWebVitals;
      }
      return true;
  }
}

/** Doc §3's original cap was 9 entries on a single sheet, from a static
 *  list - now a data-driven subset of a larger term table
 *  (strings.glossary.terms, 26 entries as of item 3.5's v2 pass), scoped
 *  per report so it can never drift out of sync with what a given report
 *  actually uses (item 33). No hard cap on rendered term count: `.sheet-
 *  standalone` only forces this section to start on its own fresh page
 *  (paged.css), it does not confine it to a single page - the section
 *  still flows across as many pages as the relevant subset needs, the
 *  same "let content flow naturally" rule item 34 already established.
 *
 *  `.sheet-standalone` itself is new (report-feedback-la-corniche-v2.md):
 *  without it, a real 105-finding La Corniche report duplicated this
 *  section's first ~14 entries onto a second page fragment with a blank
 *  page in between - Paged.js's own layout engine cloning already-placed
 *  DOM nodes while reflowing the boundary between the annex's last page
 *  and this section's first, confirmed via a debug DOM diff (not fixable
 *  from this package's markup once triggered, no console error surfaced
 *  either). Starting the section on a guaranteed fresh page removes the
 *  specific fractional-leftover-space condition that triggered it for
 *  this document; kept narrow to this section rather than applied
 *  report-wide since every other section already flows correctly. */
export function renderGlossary(
  strings: ReportStrings,
  ordinal: number,
  ctx: GlossaryContext,
): string {
  const g = strings.glossary;
  const relevantTerms = g.terms.filter((t) => isGlossaryTermRelevant(t.id, ctx));

  const items = relevantTerms
    .map(
      (t) => `
        <div class="glossary-entry" style="margin-bottom:var(--space-4)">
          <div style="font-size:14px;font-weight:500;color:var(--color-accent-300)">${escapeHtml(t.term)}</div>
          <div style="font-size:13px;opacity:0.8">${escapeHtml(t.definition)}</div>
        </div>
      `,
    )
    .join('');

  return sheet(
    `
    ${renderSheetHeader(ordinal, g.eyebrow, g.heading, 'var(--space-6)')}
    ${items}
  `,
    '',
    'section-13',
  );
}
