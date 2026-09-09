import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, sheet } from '../html-utils.js';

/** Stable DOM id of the fallback analysis note. Deliberately non-numbered
 *  chrome: it must never enter SECTION_IDS or match section-registry's
 *  `section-*` id shape, or it would perturb computeSectionNumbers and the
 *  TOC's live ordinals for a block that takes no ordinal (issue #162). */
export const FALLBACK_ANALYSIS_NOTE_ID = 'report-fallback-analysis';

/** Plan 032 (issue #162): the static, honest note the report renders when
 *  the audit fallback gate skipped the structure and writing passes. It
 *  replaces nothing and renumbers nothing: it sits between section-00 and
 *  section-01 as unnumbered chrome, like the metadata sheet, so every
 *  normal report (generationMode absent) renders byte-identically through
 *  the '' early return. Interpolates static bilingual strings only, never
 *  findings or model text. */
export function renderFallbackAnalysisNote(
  strings: ReportStrings,
  analysis: StoredAnalysis,
): string {
  if (analysis.generationMode !== 'static-fallback') return '';
  return sheet(
    `
    <div style="margin-bottom:var(--space-2)">
      <h6 style="color:var(--color-accent-300);margin:0">${escapeHtml(strings.fallbackAnalysis.noteHeading)}</h6>
    </div>
    <p style="font-size:12.5px;opacity:0.9;margin:0;max-width:66ch">${escapeHtml(strings.fallbackAnalysis.noteBody)}</p>
  `,
    '',
    FALLBACK_ANALYSIS_NOTE_ID,
  );
}
