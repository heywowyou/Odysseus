import type { ReportLanguage } from '@odysseus/core';
import { BUSINESS_CLAIM_EXAMPLES } from './business-claim-guard.js';
import {
  BANNED_SEVERITY_SYNONYMS,
  FINDING_NOUN_VOCABULARY,
  SEVERITY_VOCABULARY,
} from './severity-vocabulary-guard.js';
import type { WritingInput } from './writing-schema.js';
import { REQUIRED_WCAG_VERSION } from './wcag-citation-guard.js';

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
 *  are already final. usedFallbackContext per docs/rules/llm-layer-rules.md
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
  // issue #21: the note used to present only the four canonical words, so
  // the model avoided the banned synonyms by luck; at the configured low
  // temperature a French run reached for "graves" on eight consecutive
  // attempts and every retry was rejected. The note now names the banned
  // words themselves, from the same table the guard enforces.
  const severityVocabularyNote = `\n\nWhen referring to a severity level anywhere in your prose (a theme title, executiveSummary, notes, businessImpact, or recommendedActions), use exactly one of these four words, never a synonym: "${v.critical}", "${v.serious}", "${v.moderate}", "${v.minor}". The stats box and the findings annex use these exact words; a different word for the same level (for example a rough synonym of "${v.serious}") reads as a second, contradictory classification system to a reader comparing the two. These synonyms are banned outright and their presence rejects the response: ${BANNED_SEVERITY_SYNONYMS[language].join(', ')}.`;

  // item 3.7 (La Corniche pass): a real report's template-bound sentence
  // said "constats" while the model's own executiveSummary prose right
  // next to it said "problèmes" for the same thing - a client reading
  // both in the same paragraph has to work out they're the same noun.
  const fn = FINDING_NOUN_VOCABULARY[language];
  const findingNounNote = `\n\nWhen referring to what the audit detected anywhere in your prose (executiveSummary, notes, businessImpact, or recommendedActions), use "${fn.singular}"/"${fn.plural}" (or its exact grammatical inflections), never a synonym like "${language === 'fr' ? 'problème(s)' : 'problem(s)'}" or "issue(s)". The stats box, the findings annex, and the sentence immediately before your executiveSummary text all use this exact word.`;

  // Same source of truth as wcag-citation-guard.ts (REQUIRED_WCAG_VERSION):
  // the prompt states the number the guard enforces, never a second copy.
  const wcagVersionNote = `\n\nWhen citing the WCAG standard anywhere in your prose, cite version ${REQUIRED_WCAG_VERSION} exactly, never another version. The scanner audits the WCAG ${REQUIRED_WCAG_VERSION} AA criteria, so a citation of any other version contradicts the report's own methodology. Criterion numbers alone (like 1.4.3) are always safe.`;

  // Same source of truth as business-claim-guard.ts
  // (BUSINESS_CLAIM_EXAMPLES): the prompt names the exact shape of claim
  // the guard rejects. The hedge escape hatch mirrors the guard's
  // sentence-level hedge allowance.
  const businessClaimNote = `\n\nYou are given no revenue, traffic, or conversion data, so you cannot know which page matters most commercially. Never assert one, for example never write "${BUSINESS_CLAIM_EXAMPLES[language]}" or any similar profitability or revenue superlative, as a fact. You may say a page appears commercially important and explain why, using a hedged verb ("semble", "appears") in that same sentence - that is inference the client can weigh, not a claim they must correct. Responses containing an unhedged business-value superlative are rejected.`;

  // item D8 (P4): a real report stated "Les lenteurs d'affichage, causées
  // par des scripts bloquants" - the scanner measured a correlation
  // between blocking-script findings and slow metrics, on the same page,
  // not a proven causal mechanism. "liées à"/"linked to" costs nothing and
  // doesn't overstate what a page-load audit can actually establish.
  const causationNote =
    '\n\nThe scanner reports what it measured directly: a finding, a metric, a page. It does not trace causal chains between them. When two things measured on the same page appear related (for example, blocking scripts and a slow load metric), describe them as linked or associated, never as one causing the other, unless the finding data itself states a direct mechanism. In French, prefer "liées à" over "causées par" for this.';

  return `You are the writing layer of Odysseus, a web audit tool for French small and mid-size businesses.

A separate structuring pass has already grouped this audit's findings into themes and decided each theme's category, effort, impact, priority rank, quick wins, and overall risk. Those decisions are final: you cannot change groupings, priorities, effort, impact, category, quick wins, or overall risk, and your response schema has no fields for any of them.

The legal relevance of an accessibility theme (which WCAG criterion applies) is also decided outside this pass, from the underlying finding data, not written by you - your response schema has no field for it.

Never state how many pages a problem affects. You are shown at most three example pages per finding, never the full list, so any page count you write is a guess - and the report renders the real count next to your text, where a reader will see the two disagree. Write "les pages concernees" / "the affected pages", never "les 18 pages concernees" / "18 pages". Responses containing a page count are rejected.

Never state a legal consequence for this business. Do not write that it risks or is exposed to a fine, a sanction, a penalty, prosecution, litigation, or "legal risk", and do not write that anything is illegal or legally required for it. Whether a law binds this particular company depends on its size and sector and is stated elsewhere in the report, from registry data, not by you. Write the commercial consequence instead: lost customers, lost bookings, lost trust. Responses that state a legal consequence are rejected.

Each theme you are given below has a themeKey (for example "t1"). For every theme you are given, write:
- title: a short, plain-language theme name. It is model-written prose like every other field below and is checked by the same guards; a short label does not exempt it from any rule on this page.
- businessImpact: why this matters commercially, in plain language, no jargon, no scanner terminology. At most two sentences - your response is checked against this limit and rejected if it is longer.
- recommendedActions: at most three concrete next steps. Never list individual page URLs - refer to pages by count only (for example "18 pages" or "the sitemap page"), page-level detail belongs in the report's appendix, not in your prose. Assume the client is a small or mid-size business with no in-house developer and no one on staff who owns a screen reader or other assistive-technology tool - phrase every action as something to hand to "your technical provider" (or the exact equivalent phrase in the response language, e.g. "votre prestataire technique" in French). Use this exact same phrase every time, in every recommendedActions entry across every theme - never switch to "your agency"/"votre agence" or any other synonym partway through: a report where one priority says "ask your technical provider" and another says "ask your agency" reads as two different parties, not one. Never phrase an action as an instruction to the client's own developers, or as an instruction for the client to personally test something themselves - not with a screen reader, not by testing keyboard navigation, not any other manual check - this audit is fully automated and asking the client to personally perform a manual test contradicts that. For example, write "ask your technical provider to add appropriate ARIA roles to X" rather than "train your developers on ARIA" or "test with a screen reader" or "test keyboard navigation yourself".

You must return exactly one theme object per themeKey shown to you, echoing its themeKey verbatim. Do not invent a themeKey you were not shown, do not omit one you were shown, and do not return more than one object for the same themeKey.

Also write an executiveSummary aimed at a non-technical decision maker, and a notes field for anything else worth telling the client. The report template states the exact counts (pages scanned, total findings, findings by severity) in a sentence placed immediately before your executiveSummary text, so do not restate, estimate, or reference any of those figures yourself: never write a number of findings, pages, or occurrences anywhere in executiveSummary, not even a rough or rounded one. Your response is checked for this after every attempt; a response containing a digit in executiveSummary is rejected and you are asked again. Write only the qualitative framing and connecting prose that goes with the counts already stated: what kind of problems dominate, why they matter for the business, and what the overall picture is.
${dominantMetricNote}${severityVocabularyNote}${findingNounNote}${wcagVersionNote}${businessClaimNote}${causationNote}
${LANGUAGE_INSTRUCTION[language]}${fallbackNote}

Respond with structured JSON matching the required schema only. No prose outside the JSON fields, no markdown fences.`;
}

/**
 * previousRejection carries the guard's failure reason from the immediately
 * preceding attempt, on retries only (see buildWritingRetryFeedback).
 */
export function buildWritingUserPrompt(input: WritingInput, previousRejection?: string): string {
  const correction = previousRejection ? `\n\n${previousRejection}` : '';
  return `Here is the site context and the themes to write about:\n\n${JSON.stringify(input, null, 2)}${correction}`;
}

/**
 * The correction text appended to the next attempt's user prompt after a
 * rejection. Issue #21: analyzeWriting used to re-send the identical
 * conversation on every attempt, and at the configured low temperature a
 * rejected response reproduced identically (measured live: eight
 * consecutive French rejections for the same word, zero passes), so a
 * retry must be a correction, not a rerun. Same shape and wording as
 * buildOutreachRetryFeedback (issue #12), whose arithmetic-variant is not
 * needed here: no writing-pass guard enforces a count the model could
 * undershoot.
 */
export function buildWritingRetryFeedback(reason: string): string {
  return `Your previous response was rejected by the automated guard: ${reason}. Write a new response that fixes exactly this problem. Every other requirement still applies.`;
}
