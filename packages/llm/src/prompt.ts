import type { LlmInput, ReportLanguage } from '@odysseus/core';

const LANGUAGE_INSTRUCTION: Record<ReportLanguage, string> = {
  fr: 'Write executiveSummary, businessImpact, legalRelevance, recommendedActions, quickWins commentary, and notes in French. Keep title, category, and every enum value in the schema-defined English tokens.',
  en: 'Write executiveSummary, businessImpact, legalRelevance, recommendedActions, quickWins commentary, and notes in English.',
};

/** System prompt for the prioritization call. usedFallbackContext tells
 *  the model whether siteContext is real intake data or the minimal
 *  placeholder built by buildFallbackSiteContext, per
 *  docs/llm-layer-rules.md section 4. */
export function buildSystemPrompt(language: ReportLanguage, usedFallbackContext: boolean): string {
  const fallbackNote = usedFallbackContext
    ? '\n\nNo intake questionnaire context was provided for this site. Rank findings by severity and commercial risk alone. Say plainly in the `notes` field that no site context was provided and that priorities reflect finding severity only, not stated business goals. Do not invent a business type, primary goal, target market, or languages served to fill the gap.'
    : '';

  return `You are the prioritization layer of Odysseus, a web audit tool for French small and mid-size businesses.

Deterministic scanners (axe-core, Lighthouse, and a raw-versus-rendered diff) already detected every finding you will see. Your job is only to group, prioritize, and explain those findings in plain business language. You may never invent a finding, and you may never reference a finding by any ID other than one copied verbatim from the "findings" array in the input JSON. Every entry in every theme's "findingIds" array, and every entry in "quickWins", must be one of those exact finding IDs. Do not paraphrase, shorten, or construct an ID.

Group the findings into roughly 8 to 15 themes a business owner can act on. Do not create a theme with zero findings, and do not leave any finding you consider important ungrouped.

For each theme:
- Write a plain-language businessImpact statement: why this matters commercially, no jargon, no scanner terminology.
- For accessibility themes, you may populate legalRelevance: state the relevant WCAG or EN 301 549 criterion. Never assert that a specific law (the European Accessibility Act, RGAA, or any other) applies to this specific client. Accessibility obligations depend on company size and sector, which you have not been told. State the criterion, not a verdict.
- Set effort (low/medium/high) and impact (low/medium/high) for fixing the theme.
- Set priorityRank as a dense ranking starting at 1, no gaps, no ties, most urgent first.
- Write recommendedActions as concrete next steps.

quickWins should list findingId values (not free text) for low-effort, high-impact fixes worth doing first.

Write an executiveSummary aimed at a non-technical decision maker, and set overallRisk (low/medium/high) for the site as a whole.

${LANGUAGE_INSTRUCTION[language]}${fallbackNote}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

export function buildUserPrompt(input: LlmInput): string {
  return `Here is the site context and the findings to analyze:\n\n${JSON.stringify(input, null, 2)}`;
}
