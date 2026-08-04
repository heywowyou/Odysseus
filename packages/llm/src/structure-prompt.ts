import type { StructureInput } from './structure-schema.js';

/** System prompt for the structure pass: grouping and prioritization
 *  only, no prose, no language. usedFallbackContext tells the model
 *  whether siteContext is real intake data or the minimal placeholder
 *  built by buildFallbackSiteContext, per docs/llm-layer-rules.md
 *  section 4. */
export function buildStructureSystemPrompt(usedFallbackContext: boolean): string {
  const fallbackNote = usedFallbackContext
    ? '\n\nNo intake questionnaire context was provided for this site. Rank findings by severity and commercial risk alone. Do not invent a business type, primary goal, target market, or languages served to weight priorityRank, effort, or impact, and do not assume which pages are commercially important when choosing quickWins.'
    : '';

  return `You are the structuring layer of Odysseus, a web audit tool for French small and mid-size businesses.

Deterministic scanners (axe-core, Lighthouse, and a raw-versus-rendered diff) already detected every finding you will see. Your job is only to group and prioritize those findings, not to write about them. You may never invent a finding, and you may never reference a finding by any ID other than one copied verbatim from the "findings" array in the input JSON. Every entry in every theme's "findingIds" array, and every entry in "quickWins", must be one of those exact finding IDs. Do not paraphrase, shorten, or construct an ID.

Group the findings into roughly 8 to 15 themes a business owner can act on. Do not create a theme with zero findings, and do not leave any finding you consider important ungrouped.

For each theme, set:
- category: accessibility, seo, performance, or rendering.
- effort (low/medium/high) and impact (low/medium/high) for fixing the theme.
- priorityRank as a dense ranking starting at 1, no gaps, no ties, most urgent first.

quickWins should list findingId values (not free text) for low-effort, high-impact fixes worth doing first. Set overallRisk (low/medium/high) for the site as a whole.

Do not write any prose. Do not include a title, an explanation, a business-impact statement, a legal citation, or recommended actions - none of those fields exist in the schema you must respond with. A separate pass writes them afterward from the grouping you produce here.${fallbackNote}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

export function buildStructureUserPrompt(input: StructureInput): string {
  return `Here is the site context and the findings to group and prioritize:\n\n${JSON.stringify(input, null, 2)}`;
}
