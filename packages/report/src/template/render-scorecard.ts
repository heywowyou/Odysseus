import { escapeHtml } from './html-utils.js';
import { GRADE } from './design-tokens.js';
import type { Grade } from './grade.js';
import { GRADE_GLYPHS } from './grade-glyphs.js';

/** The letter as an outline cropped to its own ink, sized in em so the
 *  badge's font-size still scales it. Flex then centers the ink box itself,
 *  not a font line box (see grade-glyphs.ts). */
function renderGradeGlyph(grade: Grade): string {
  const glyph = GRADE_GLYPHS[grade];
  return `<svg class="scorecard-grade-glyph" aria-hidden="true" focusable="false" viewBox="0 0 ${glyph.width} ${glyph.height}" style="display:block;overflow:visible;width:${glyph.width / 1000}em;height:${glyph.height / 1000}em;fill:currentColor"><path d="${glyph.path}"/></svg>`;
}

/** Renders a deterministic letter grade with its mandatory disclaimer
 *  sentence. There is deliberately no code path here that can render the
 *  grade without the sentence: the operator picked "grade, always paired
 *  with a fixed disclaimer" as the non-negotiable-rule-6 mitigation for
 *  showing a grade at all (docs/product/fix-snippets-and-scorecard-brainstorm.md,
 *  "Operator direction pick"), and this function is the one place both the
 *  report cover/metadata sheet and the outreach preview call to render one,
 *  so the two can never drift into showing a bare grade. */
export function renderScorecardGrade(grade: Grade, disclaimer: string, label?: string): string {
  const { color, bg } = GRADE[grade];
  const labelHtml =
    label === undefined
      ? ''
      : `<div class="scorecard-grade-label" style="text-transform:uppercase;letter-spacing:0.02em;font-size:10px;opacity:0.5;margin-bottom:4px">${escapeHtml(label)}</div>`;
  return `
    <div class="scorecard-grade">
      ${labelHtml}
      <span class="scorecard-grade-badge" data-grade="${escapeHtml(grade)}" role="img" aria-label="${escapeHtml(grade)}" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:6px;font-size:20px;font-weight:600;color:${color};background:${bg}">${renderGradeGlyph(grade)}</span>
      <div class="scorecard-grade-disclaimer" style="font-size:10px;opacity:0.55;margin-top:4px;max-width:32ch">${escapeHtml(disclaimer)}</div>
    </div>
  `;
}
