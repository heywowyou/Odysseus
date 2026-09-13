import { escapeHtml } from './html-utils.js';
import { SEVERITY } from './design-tokens.js';
import type { Grade } from './grade.js';

/** Reuses the existing severity color ramp (design-tokens.ts's `SEVERITY`,
 *  trade-off 84: never invent a token value instead of transcribing one).
 *  Four grades, four tones - one each, no sharing needed. */
const GRADE_COLOR: Record<Grade, { color: string; bg: string }> = {
  A: SEVERITY.minor,
  B: SEVERITY.moderate,
  C: SEVERITY.serious,
  D: SEVERITY.critical,
};

/** Renders a deterministic letter grade with its mandatory disclaimer
 *  sentence. There is deliberately no code path here that can render the
 *  grade without the sentence: the operator picked "grade, always paired
 *  with a fixed disclaimer" as the non-negotiable-rule-6 mitigation for
 *  showing a grade at all (docs/product/fix-snippets-and-scorecard-brainstorm.md,
 *  "Operator direction pick"), and this function is the one place both the
 *  report cover/metadata sheet and the outreach preview call to render one,
 *  so the two can never drift into showing a bare grade. */
export function renderScorecardGrade(grade: Grade, disclaimer: string, label?: string): string {
  const { color, bg } = GRADE_COLOR[grade];
  const labelHtml =
    label === undefined
      ? ''
      : `<div class="scorecard-grade-label" style="text-transform:uppercase;letter-spacing:0.02em;font-size:10px;opacity:0.5;margin-bottom:4px">${escapeHtml(label)}</div>`;
  return `
    <div class="scorecard-grade">
      ${labelHtml}
      <span class="scorecard-grade-badge" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:6px;font-size:20px;font-weight:600;color:${color};background:${bg}">${escapeHtml(grade)}</span>
      <div class="scorecard-grade-disclaimer" style="font-size:10px;opacity:0.55;margin-top:4px;max-width:32ch">${escapeHtml(disclaimer)}</div>
    </div>
  `;
}
