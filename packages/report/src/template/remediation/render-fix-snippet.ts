import { escapeHtml } from '../html-utils.js';
import { VERBATIM_EVIDENCE_ATTRIBUTE } from '../render-lint.js';

/** The two report-strings blocks (priority themes, remaining work) that
 *  carry the fix snippet labels are structurally identical, so this helper
 *  is typed against the shape rather than either concrete strings type. */
export interface FixSnippetStrings {
  fixSnippetLabel: string;
  fixSnippetFillInBlankNote: string;
}

/** Renders a rule's already-computed fix snippet (rendered-priorities.ts's
 *  `PriorityRemediation.snippet` or remaining-work.ts's equivalent) as a
 *  code block, or an empty string when the rule has no snippet (classified
 *  `not-applicable`, or no reviewed entry at all). Shared by both report
 *  render sites (plan 041 Part A) so the two never drift in markup or
 *  escaping.
 *
 *  The snippet's `rendered` text is example code, not markup: it is run
 *  through `escapeHtml` here, once, at the point it enters the document. */
export function renderFixSnippet(
  snippet: { kind: 'fixed' | 'fill-in-blank'; rendered: string } | undefined,
  strings: FixSnippetStrings,
): string {
  if (snippet === undefined) return '';
  const note =
    snippet.kind === 'fill-in-blank'
      ? `<div style="font-size:10.5px;opacity:0.6;margin-top:2px">${escapeHtml(strings.fixSnippetFillInBlankNote)}</div>`
      : '';
  return `
    <div class="fix-snippet" style="margin-top:4px">
      <div style="font-size:10px;opacity:0.6;text-transform:uppercase;letter-spacing:0.02em">${escapeHtml(strings.fixSnippetLabel)}</div>
      <pre style="margin:2px 0 0;padding:6px 8px;font-size:11.5px;background:rgba(0,0,0,0.04);border-radius:4px;white-space:pre-wrap;word-break:break-word"><code ${VERBATIM_EVIDENCE_ATTRIBUTE}>${escapeHtml(snippet.rendered)}</code></pre>
      ${note}
    </div>
  `;
}
