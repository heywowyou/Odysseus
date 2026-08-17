import type { ReportLanguage } from '@odysseus/core';
import type { RenderDiffEvidencePage } from '../../screenshots.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';

/** Doc §3: bars only, no screenshots - two proportional-width bars (raw
 *  HTML vs rendered visible-text length) and a one-line caption, never an
 *  <img>. Screenshots stay in the technical export; embedding rasters
 *  here is what produced 20 pages of paired full-width screenshots and
 *  the blank slabs/orphaned captions the redesign fixed. The raw bar's
 *  width is proportional to the rendered bar (which is always drawn
 *  full-width, 100%): a page missing 80% of its text shows a raw bar at
 *  roughly a fifth the width of the rendered one. */
function renderPageCard(strings: ReportStrings, language: ReportLanguage, page: RenderDiffEvidencePage): string {
  const r = strings.renderDiffEvidence;
  const rawChars = page.rawTextLength === null ? '?' : formatNumber(page.rawTextLength, language);
  const renderedChars = page.renderedTextLength === null ? '?' : formatNumber(page.renderedTextLength, language);
  const rawPct =
    page.rawTextLength !== null && page.renderedTextLength !== null && page.renderedTextLength > 0
      ? Math.max(2, Math.round((page.rawTextLength / page.renderedTextLength) * 100))
      : 100 - Math.round(page.missingPercent);

  // B2: a missing selector (the 5-20% missingPercent band, where no
  // render-diff finding exists to read one from) used to fill the "sur
  // {selector}" clause with a bare hyphen ("sur -."). Drop the clause
  // instead of filling it with a placeholder.
  const caption = page.selector
    ? fillTemplate(r.missingCaptionTemplate, {
        percent: Math.round(page.missingPercent),
        selector: page.selector,
      })
    : fillTemplate(r.missingCaptionNoSelectorTemplate, {
        percent: Math.round(page.missingPercent),
      });

  return `
    <div class="card elev-sm render-card" style="margin-bottom:var(--space-4)">
      <div class="card-kicker">${escapeHtml(page.pageUrl)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-top:6px">
        <div>
          <div style="font-size:11px;opacity:0.6;margin-bottom:4px">${escapeHtml(fillTemplate(r.rawBarLabelTemplate, { chars: rawChars }))}</div>
          <div style="height:10px;border-radius:5px;background:var(--color-neutral-800);overflow:hidden"><div style="height:100%;width:${rawPct}%;background:var(--color-neutral-500)"></div></div>
        </div>
        <div>
          <div style="font-size:11px;opacity:0.6;margin-bottom:4px">${escapeHtml(fillTemplate(r.renderedBarLabelTemplate, { chars: renderedChars }))}</div>
          <div style="height:10px;border-radius:5px;background:var(--color-neutral-800);overflow:hidden"><div style="height:100%;width:100%;background:var(--color-accent)"></div></div>
        </div>
      </div>
      <div class="card-body" style="margin-top:4px">${escapeHtml(caption)}</div>
    </div>
  `;
}

export function renderRenderDiffEvidence(
  strings: ReportStrings,
  language: ReportLanguage,
  pages: readonly RenderDiffEvidencePage[],
  totalEligible: number,
  /** B6: count of pages excluded from consideration entirely because
   *  they're third-party wrapper or noindex-legal pages - not counted in
   *  totalEligible, since they were never eligible evidence to begin
   *  with. Used only to decide whether the positive-statement fallback
   *  names them as a named exception. */
  wrapperOrLegalExcludedCount = 0,
): string {
  const r = strings.renderDiffEvidence;

  if (pages.length === 0) {
    // B6: an empty section reads as "nothing to show," which is wrong
    // when the truth is "nothing wrong was found on the pages that
    // matter." State that positively instead of returning nothing.
    const wrapperNote = wrapperOrLegalExcludedCount > 0 ? ` ${r.positiveStatementWrapperNote}` : '';
    return sheet(`
      ${renderSheetHeader(r.eyebrow, r.heading)}
      <p style="font-size:13px;opacity:0.6;margin-bottom:var(--space-6)">${escapeHtml(r.intro)}</p>
      <p style="font-size:13.5px;opacity:0.85">${escapeHtml(r.positiveStatementTemplate)}${escapeHtml(wrapperNote)}</p>
    `, '', 'section-08');
  }

  const overflowCount = totalEligible - pages.length;
  const overflowText =
    overflowCount > 0 ? fillTemplate(r.overflowTextTemplate, { count: formatNumber(overflowCount, language) }) : '';

  const cards = pages.map((page) => renderPageCard(strings, language, page)).join('');

  return sheet(`
    ${renderSheetHeader(r.eyebrow, r.heading)}
    <p style="font-size:13px;opacity:0.6;margin-bottom:var(--space-6)">${escapeHtml(r.intro)}</p>
    ${cards}
    ${overflowText ? `<p style="font-size:12px;opacity:0.55;margin-top:var(--space-4)">${escapeHtml(overflowText)}</p>` : ''}
  `, '', 'section-08');
}
