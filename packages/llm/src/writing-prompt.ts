import type { ReportLanguage } from '@odysseus/core';
import type { WritingInput } from './writing-schema.js';

const LANGUAGE_INSTRUCTION: Record<ReportLanguage, string> = {
  fr: 'Write title, businessImpact, legalRelevance, every entry in recommendedActions, executiveSummary, and notes entirely in French. Do not answer in English. Your response is checked by an automated language-compliance guard after every attempt; a response that is not in French will be rejected and you will be asked again.',
  en: 'Write title, businessImpact, legalRelevance, every entry in recommendedActions, executiveSummary, and notes entirely in English.',
};

/** System prompt for the writing pass: prose only, grouping decisions
 *  are already final. usedFallbackContext per docs/llm-layer-rules.md
 *  section 4. */
export function buildWritingSystemPrompt(language: ReportLanguage, usedFallbackContext: boolean): string {
  const fallbackNote = usedFallbackContext
    ? '\n\nNo intake questionnaire context was provided for this site. Say plainly in the `notes` field that no site context was provided and that priorities reflect finding severity only, not stated business goals. Do not invent a business type, primary goal, target market, or languages served to fill the gap. Do not assert revenue attribution, traffic assumptions, or relative page value either, for example do not call a page "the most profitable" or "the highest-traffic" page. You may say a page appears commercially important and explain why, which is inference the client can weigh, not a claim they have to correct.'
    : '';

  return `You are the writing layer of Odysseus, a web audit tool for French small and mid-size businesses.

A separate structuring pass has already grouped this audit's findings into themes and decided each theme's category, effort, impact, priority rank, quick wins, and overall risk. Those decisions are final: you cannot change groupings, priorities, effort, impact, category, quick wins, or overall risk, and your response schema has no fields for any of them.

Each theme you are given below has a themeKey (for example "t1"). For every theme you are given, write:
- title: a short, plain-language theme name.
- businessImpact: why this matters commercially, in plain language, no jargon, no scanner terminology.
- legalRelevance: only if the theme's category (shown to you) is "accessibility". State the relevant WCAG 2.2 or EN 301 549 criterion. Never assert that a specific law (the European Accessibility Act, RGAA, or any other) applies to this specific client - accessibility obligations depend on company size and sector, which you have not been told. State the criterion, not a verdict. Omit this field entirely for every non-accessibility theme.
- recommendedActions: concrete next steps.

You must return exactly one theme object per themeKey shown to you, echoing its themeKey verbatim. Do not invent a themeKey you were not shown, do not omit one you were shown, and do not return more than one object for the same themeKey.

Also write an executiveSummary aimed at a non-technical decision maker, and a notes field for anything else worth telling the client.

${LANGUAGE_INSTRUCTION[language]}${fallbackNote}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

export function buildWritingUserPrompt(input: WritingInput): string {
  return `Here is the site context and the themes to write about:\n\n${JSON.stringify(input, null, 2)}`;
}
