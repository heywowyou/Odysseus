import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, sheet } from '../html-utils.js';

/** The id every numbered section's own `sheet(...)` call passes as its
 *  third argument (html-utils.ts), in the same order render-html.ts's
 *  renderBody renders them - not part of the translated ReportStrings
 *  since an id is not user-facing text. B8: previously the TOC had no
 *  resolved page numbers at all, on the reasoning (docs/report-v2-refactor.md
 *  D29) that a two-pass render would be required - true for a Chromium
 *  print-CSS pipeline, but that reasoning predates the Paged.js rebuild
 *  (CLAUDE.md trade-off 9). Paged.js's own polyfill resolves
 *  target-counter() after layout, in one pass, so this isn't reversing
 *  D29, it's D29's stated blocker no longer applying to this renderer. */
const TOC_SECTION_IDS = [
  'section-01', 'section-02', 'section-03', 'section-04', 'section-05', 'section-06', 'section-07',
  'section-08', 'section-09', 'section-10', 'section-11', 'section-12', 'section-13', 'section-14',
] as const;

export function renderToc(strings: ReportStrings): string {
  const rows = strings.toc.items
    .map(
      (item, index) => `
        <div style="display:flex;align-items:baseline;gap:var(--space-3);padding:9px 0;background:linear-gradient(to right,transparent,var(--color-divider) 0,var(--color-divider) 100%,transparent) no-repeat bottom/100% 1px">
          <span class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${index + 1}</span>
          <a href="#${TOC_SECTION_IDS[index]}" style="flex:1;font-size:14.5px;color:inherit;text-decoration:none">${escapeHtml(item)}</a>
          <span class="toc-page" style="font-size:12px;color:var(--color-accent-300);flex:none"></span>
        </div>
      `,
    )
    .join('');

  return sheet(`
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(strings.toc.eyebrow)}</h6>
    </div>
    <h2 style="margin-bottom:var(--space-6)">${escapeHtml(strings.toc.heading)}</h2>
    ${rows}
  `);
}
