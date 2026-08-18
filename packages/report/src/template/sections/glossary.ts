import type { Finding, ObligationAssessment } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, renderSheetHeader, sheet } from '../html-utils.js';
import { isArticle47Regime } from './accessibility-statement.js';

export interface GlossaryContext {
  findings: readonly Finding[];
  obligationAssessment: ObligationAssessment | undefined;
  /** manifest.siteSignals?.hasTransactionalFlow !== undefined - the
   *  transactional-flow question was actually evaluated for this scan,
   *  regardless of the answer, so the term used to state that (section
   *  02) is relevant either way. */
  transactionalFlowEvaluated: boolean;
}

/** item 33: whether each conditional glossary term id is relevant to a
 *  given report - the 9-term static list previously defined RGAA even on
 *  an EAA-route report that never mentions it (item 19 stops that
 *  section from rendering at all) and omitted every performance-metric
 *  abbreviation and GEO/SEO term the report does use. Terms not listed
 *  here are always included (the severity vocabulary, WCAG/EAA/EN 301 549,
 *  the five Core Web Vitals, and the constat/occurrence/sélecteur/DGCCRF
 *  terms every report's stats, appendix, and legal sections reference
 *  unconditionally). */
function isGlossaryTermRelevant(id: string, ctx: GlossaryContext): boolean {
  switch (id) {
    case 'rgaa':
      return isArticle47Regime(ctx.obligationAssessment);
    case 'seo':
      return ctx.findings.some((f) => f.category === 'seo');
    case 'geo':
      return ctx.findings.some((f) => f.category === 'geo');
    case 'parcours-transactionnel':
      return ctx.transactionalFlowEvaluated;
    default:
      return true;
  }
}

/** Doc §3 cap: 9 entries, 1 sheet in the original static list - now a
 *  data-driven subset of a larger term table (strings.glossary.terms),
 *  scoped per report so it can never drift out of sync with what a given
 *  report actually uses (item 33). */
export function renderGlossary(strings: ReportStrings, ordinal: number, ctx: GlossaryContext): string {
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

  return sheet(`
    ${renderSheetHeader(ordinal, g.eyebrow, g.heading)}
    ${items}
  `, '', 'section-13');
}
