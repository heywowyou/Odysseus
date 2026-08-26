import type { ReportLanguage } from '@odysseus/core';
import type { RenderDiffEvidencePage } from '../../screenshots.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';

/** Doc §3: bars only, no screenshots - two proportional-width bars (raw
 *  HTML vs rendered visible-text length) and a one-line caption, never an
 *  <img>. A10 (2026-08-24): this used to say screenshots "stay in the
 *  technical export", which was never true - there is no export route and
 *  no other section renders them, so the scan's screenshots are simply not
 *  shown to the client at all. That is the intended behaviour (the bars
 *  carry the evidence, and not publishing full-page captures of a client
 *  site is the data-minimisation posture trade-off 2 already takes), but
 *  the comment promised a deliverable that does not exist. Embedding rasters
 *  here is what produced 20 pages of paired full-width screenshots and
 *  the blank slabs/orphaned captions the redesign fixed. The raw bar's
 *  width is proportional to the rendered bar (which is always drawn
 *  full-width, 100%): a page missing 80% of its text shows a raw bar at
 *  roughly a fifth the width of the rendered one. */
function renderPageCard(
  strings: ReportStrings,
  language: ReportLanguage,
  page: RenderDiffEvidencePage,
): string {
  const r = strings.renderDiffEvidence;

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

  // Item 0.3: rawTextLength/renderedTextLength come from the same source
  // entry and are always both present or both null (screenshots.ts). When
  // both are null, drawing two bars from unknown data is worse than
  // drawing none, so the bar pair is suppressed entirely rather than
  // labelled with a "?" placeholder.
  const bars =
    page.rawTextLength === null || page.renderedTextLength === null
      ? `<p style="font-size:12px;opacity:0.6;margin-top:6px">${escapeHtml(r.charCountsUnavailableNote)}</p>`
      : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-top:6px">
        <div>
          <div style="font-size:11px;opacity:0.6;margin-bottom:4px">${escapeHtml(fillTemplate(r.rawBarLabelTemplate, { chars: formatNumber(page.rawTextLength, language) }))}</div>
          <div style="height:10px;border-radius:5px;background:var(--color-neutral-800);overflow:hidden"><div style="height:100%;width:${Math.max(2, Math.round((page.rawTextLength / page.renderedTextLength) * 100))}%;background:var(--color-neutral-500)"></div></div>
        </div>
        <div>
          <div style="font-size:11px;opacity:0.6;margin-bottom:4px">${escapeHtml(fillTemplate(r.renderedBarLabelTemplate, { chars: formatNumber(page.renderedTextLength, language) }))}</div>
          <div style="height:10px;border-radius:5px;background:var(--color-neutral-800);overflow:hidden"><div style="height:100%;width:100%;background:var(--color-accent)"></div></div>
        </div>
      </div>`;

  return `
    <div class="card elev-sm render-card" style="margin-bottom:var(--space-4)">
      <div class="card-kicker">${escapeHtml(page.pageUrl)}</div>
      ${bars}
      <div class="card-body" style="margin-top:4px">${escapeHtml(caption)}</div>
    </div>
  `;
}

export function renderRenderDiffEvidence(
  strings: ReportStrings,
  ordinal: number,
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
    return sheet(
      `
      ${renderSheetHeader(ordinal, r.eyebrow, r.heading)}
      <p style="font-size:13px;opacity:0.6;margin-bottom:var(--space-6)">${escapeHtml(r.intro)}</p>
      <p style="font-size:13.5px;opacity:0.85">${escapeHtml(r.positiveStatementTemplate)}${escapeHtml(wrapperNote)}</p>
    `,
      '',
      'section-08',
    );
  }

  const overflowCount = totalEligible - pages.length;
  const overflowText =
    overflowCount === 1
      ? r.overflowTextSingularTemplate
      : overflowCount > 1
        ? fillTemplate(r.overflowTextTemplate, { count: formatNumber(overflowCount, language) })
        : '';

  const cards = pages.map((page) => renderPageCard(strings, language, page)).join('');

  return sheet(
    `
    ${renderSheetHeader(ordinal, r.eyebrow, r.heading)}
    <p style="font-size:13px;opacity:0.6;margin-bottom:var(--space-6)">${escapeHtml(r.intro)}</p>
    ${cards}
    ${overflowText ? `<p style="font-size:12px;opacity:0.55;margin-top:var(--space-4)">${escapeHtml(overflowText)}</p>` : ''}
  `,
    '',
    'section-08',
  );
}
