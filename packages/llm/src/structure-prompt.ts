import type { StructureInput } from './structure-schema.js';
import { SCANNER_EVIDENCE_NOTICE } from './untrusted-evidence.js';

/** System prompt for the structure pass: grouping and prioritization
 *  only, no prose, no language. usedFallbackContext tells the model
 *  whether siteContext is real intake data or the minimal placeholder
 *  built by buildFallbackSiteContext, per docs/rules/llm-layer-rules.md
 *  section 4.
 *
 *  2026-08-24: this prompt used to carry a paragraph explaining that numeric
 *  gaps between finding IDs are normal and must never be closed by inferring
 *  the missing ID. It was removed, not weakened: findings now reach the model
 *  under the dense alias IDs finding-alias.ts assigns, so there are no gaps
 *  left to explain. The instruction had failed six attempts out of six on a
 *  real audit, which is why the gap itself was removed instead. */
export function buildStructureSystemPrompt(usedFallbackContext: boolean): string {
  const fallbackNote = usedFallbackContext
    ? '\n\nNo intake questionnaire context was provided for this site. Rank findings by severity and commercial risk alone. Do not invent a business type, primary goal, target market, or languages served to weight priorityRank, effort, or impact, and do not assume which pages are commercially important when choosing quickWins.'
    : '';

  return `You are the structuring layer of Odysseus, a web audit tool for French small and mid-size businesses.

Deterministic scanners (axe-core, Lighthouse, and a raw-versus-rendered diff) already detected every finding you will see. Your job is only to group and prioritize those findings, not to write about them. You may never invent a finding, and you may never reference a finding by any ID other than one copied verbatim from the "findings" array in the input JSON. Every entry in every theme's "findingIds" array, and every entry in "quickWins", must be one of those exact finding IDs. Do not paraphrase, shorten, or construct an ID.

Before writing any ID into your response, confirm its exact text appears in the input's "findings" array; if it does not appear there verbatim, it does not exist for this audit, regardless of how plausible it looks.

Group the findings into roughly 8 to 15 themes a business owner can act on. Do not create a theme with zero findings, and do not leave any finding you consider important ungrouped.

A theme is one remediation job: everything in it should be fixed by the same kind of work, so that a single sentence could tell the client what to do about the whole theme. Two findings belong together when fixing one is the same task as fixing the other, not merely because they share a category or a severity. A finding that needs a different fix belongs in a different theme, even when that leaves a theme with very few findings, and even when it means one finding gets a theme of its own. Never pad a theme with unrelated rules to reach a size: a heading-structure problem does not belong in a theme about language annotations, an automatic page reload does not belong in a theme about link and image text, and a layout-stability metric does not belong in a theme about loading time. Findings you cannot place in a coherent theme are better left ungrouped than filed under one they contradict.

For each theme, set:
- category: accessibility, seo, performance, rendering, or privacy. Use the category the theme's own findings carry. Use privacy for findings about security response headers, cookies, trackers, or what third parties can observe about visitors. Findings whose own category is geo have no theme category of their own: group them under seo.
- effort (low/medium/high) and impact (low/medium/high) for fixing the theme.
- priorityRank as a dense ranking starting at 1, no gaps, no ties, most urgent first.

quickWins should list findingId values (not free text) for low-effort, high-impact fixes worth doing first. Set overallRisk (low/medium/high) for the site as a whole.

Do not write any prose. Do not include a title, an explanation, a business-impact statement, a legal citation, or recommended actions - none of those fields exist in the schema you must respond with. A separate pass writes them afterward from the grouping you produce here.

${SCANNER_EVIDENCE_NOTICE}${fallbackNote}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

export function buildStructureUserPrompt(input: StructureInput): string {
  return `Here is the site context and the findings to group and prioritize:\n\n${JSON.stringify(input, null, 2)}`;
}
