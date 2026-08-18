import type { ReportLanguage } from '@odysseus/core';
import { SEVERITY_VOCABULARY } from './severity-vocabulary-guard.js';
import type { WritingInput } from './writing-schema.js';

const LANGUAGE_INSTRUCTION: Record<ReportLanguage, string> = {
  fr: 'Write title, businessImpact, every entry in recommendedActions, executiveSummary, and notes entirely in French. Do not answer in English. Your response is checked by an automated language-compliance guard after every attempt; a response that is not in French will be rejected and you will be asked again.',
  en: 'Write title, businessImpact, every entry in recommendedActions, executiveSummary, and notes entirely in English.',
};

const DOMINANT_METRIC_LABEL: Record<'lcp' | 'cls' | 'tbt', string> = {
  lcp: 'Largest Contentful Paint (LCP), meaning slow-loading main content',
  cls: 'Cumulative Layout Shift (CLS), meaning unstable visual layout',
  tbt: 'Total Blocking Time (TBT), meaning JavaScript execution blocking the browser',
};

/** System prompt for the writing pass: prose only, grouping decisions
 *  are already final. usedFallbackContext per docs/llm-layer-rules.md
 *  section 4. */
export function buildWritingSystemPrompt(
  language: ReportLanguage,
  usedFallbackContext: boolean,
  dominantPerformanceMetric: 'lcp' | 'cls' | 'tbt' | null,
): string {
  const fallbackNote = usedFallbackContext
    ? '\n\nNo intake questionnaire context was provided for this site. Say plainly in the `notes` field that no site context was provided and that priorities reflect finding severity only, not stated business goals. Do not invent a business type, primary goal, target market, or languages served to fill the gap. Do not assert revenue attribution, traffic assumptions, or relative page value either, for example do not call a page "the most profitable" or "the highest-traffic" page. You may say a page appears commercially important and explain why, which is inference the client can weigh, not a claim they have to correct.'
    : '';

  const dominantMetricNote = dominantPerformanceMetric
    ? `\n\nThe dominant performance problem on this site is ${DOMINANT_METRIC_LABEL[dominantPerformanceMetric]}. For any performance-category theme, recommendedActions must address this cause first, before any advice about image weight, CSS, or caching. Do not lead with image or CSS advice when the actual bottleneck is something else.`
    : '';

  const v = SEVERITY_VOCABULARY[language];
  const severityVocabularyNote = `\n\nWhen referring to a severity level anywhere in your prose (executiveSummary, notes, businessImpact, or recommendedActions), use exactly one of these four words, never a synonym: "${v.critical}", "${v.serious}", "${v.moderate}", "${v.minor}". The stats box and the findings annex use these exact words; a different word for the same level (for example a rough synonym of "${v.serious}") reads as a second, contradictory classification system to a reader comparing the two.`;

  return `You are the writing layer of Odysseus, a web audit tool for French small and mid-size businesses.

A separate structuring pass has already grouped this audit's findings into themes and decided each theme's category, effort, impact, priority rank, quick wins, and overall risk. Those decisions are final: you cannot change groupings, priorities, effort, impact, category, quick wins, or overall risk, and your response schema has no fields for any of them.

The legal relevance of an accessibility theme (which WCAG criterion applies) is also decided outside this pass, from the underlying finding data, not written by you - your response schema has no field for it.

Each theme you are given below has a themeKey (for example "t1"). For every theme you are given, write:
- title: a short, plain-language theme name.
- businessImpact: why this matters commercially, in plain language, no jargon, no scanner terminology. At most two sentences - your response is checked against this limit and rejected if it is longer.
- recommendedActions: at most three concrete next steps. Never list individual page URLs - refer to pages by count only (for example "18 pages" or "the sitemap page"), page-level detail belongs in the report's appendix, not in your prose.

You must return exactly one theme object per themeKey shown to you, echoing its themeKey verbatim. Do not invent a themeKey you were not shown, do not omit one you were shown, and do not return more than one object for the same themeKey.

Also write an executiveSummary aimed at a non-technical decision maker, citing the exact siteStats figures you are given (pages scanned, total findings, and the count at each severity) rather than estimating them yourself, and a notes field for anything else worth telling the client. Lead the executiveSummary with the actionable number (critical plus serious findings combined), not the raw total findings count - most findings on a real site are minor, and opening with the full total reads as alarmist relative to what actually needs attention. State the full total too, but not as the headline figure the reader is left with (for example "98 constats au total, dont 7 prioritaires" rather than leading with "98 problèmes").
${dominantMetricNote}${severityVocabularyNote}
${LANGUAGE_INSTRUCTION[language]}${fallbackNote}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

export function buildWritingUserPrompt(input: WritingInput): string {
  return `Here is the site context and the themes to write about:\n\n${JSON.stringify(input, null, 2)}`;
}
