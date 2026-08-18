import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, sheet } from '../html-utils.js';
import { SECTION_IDS, computeSectionNumbers, sectionTitle, type SectionId } from '../section-registry.js';

/** `includedIds` is whichever of the 14 SECTION_IDS actually rendered a
 *  `<section>` in the body (render-html.ts's renderBody decides this
 *  once and passes the same set to both this function and every
 *  numbered section's own header) - report-feedback-palais-gallien.md
 *  item 2: a section suppressed for having no content (observations.ts,
 *  when nothing was diverted) must disappear from the TOC too, not just
 *  the body, and every later row must renumber to stay contiguous rather
 *  than leaving a gap or a dead anchor. */
export function renderToc(strings: ReportStrings, includedIds: ReadonlySet<SectionId>): string {
  const numbers = computeSectionNumbers(includedIds);
  const rows = SECTION_IDS.filter((id) => includedIds.has(id))
    .map((id) => {
      const label = sectionTitle(id, strings);
      return `
        <div style="display:flex;align-items:baseline;gap:var(--space-3);padding:9px 0;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${numbers.get(id)}</span>
          <a href="#${id}" class="toc-row" style="flex:1;font-size:14.5px;color:inherit;text-decoration:none">${escapeHtml(label)}</a>
        </div>
      `;
    })
    .join('');

  return sheet(`
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(strings.toc.eyebrow)}</h6>
    </div>
    <h2 style="margin-bottom:var(--space-6)">${escapeHtml(strings.toc.heading)}</h2>
    ${rows}
  `, 'sheet-standalone');
}
