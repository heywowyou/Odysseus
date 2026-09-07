/** The plan 027 repetition metrics, shared by the two dev tools that
 *  measure them: lint-stored-analyses.ts (stored analyses) and
 *  measure-reasoning-effort.ts (plan 029 lever E's live comparison).
 *  Pure functions over analysis-shaped objects, no I/O, no CLI - the
 *  scripts own their own main(). One implementation on purpose: two
 *  copies of the same metric would drift exactly when a before/after
 *  comparison matters. */

import type { ReportLanguage } from '@odysseus/core';
import { PROMPT_EXAMPLE_SENTENCES } from './writing-prompt.js';
import type { ProseField } from './prose-fields.js';

export interface StoredAnalysisShape {
  executiveSummary?: unknown;
  notes?: unknown;
  themes?: Array<{ title?: unknown; businessImpact?: unknown; recommendedActions?: unknown }>;
}

/** Plan 027 step 6: the diagnosis behind this whole plan was a set of
 *  repetition measurements (18/18 identical recommendedActions openings,
 *  a verbatim-copied closing sentence), not a single violation count. These
 *  three additions measure the same shape of problem for any *future*
 *  prompt regression, without gating anything - promotion to a guard is
 *  the same "measure first" doctrine trade-off 55 already applies to the
 *  shadow reviewer. */
export interface RepetitionMetrics {
  recommendedActionsTotal: number;
  recommendedActionsSharingFirstFiveWords: number;
  businessImpactTotal: number;
  businessImpactSharingFirstTwoWords: number;
  verbatimPromptExampleMatches: string[];
}

function firstWords(text: string, count: number): string {
  return text.trim().split(/\s+/).slice(0, count).join(' ').toLowerCase();
}

function mostCommonShare(values: readonly string[]): number {
  if (values.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const mostCommon = Math.max(...counts.values());
  return mostCommon / values.length;
}

/** The stored prose has already been through typography normalization, so
 *  it carries typographic apostrophes while the prompt-example constants
 *  carry straight ones. Comparing the two raw forms is why this check
 *  reported zero on every French analysis ever linted: with an apostrophe
 *  in every French example, it could not return anything else. */
function straighten(text: string): string {
  return text.replace(/[\u2019\u02BC]/g, "'").toLowerCase();
}

/** Long enough that an ordinary shared turn of phrase does not trip it,
 *  short enough to catch a reused opening clause. */
const SHARED_OPENING_WORD_THRESHOLD = 6;

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Counts how many leading words any sentence of `text` shares with
 *  `example`, taking the best sentence. */
function sharedOpeningWordCount(text: string, example: string): number {
  const exampleWords = wordsOf(example);
  let best = 0;
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = wordsOf(sentence);
    let shared = 0;
    while (
      shared < words.length &&
      shared < exampleWords.length &&
      words[shared] === exampleWords[shared]
    ) {
      shared++;
    }
    if (shared > best) best = shared;
  }
  return best;
}

function findVerbatimPromptExampleMatches(
  fields: readonly ProseField[],
  language: ReportLanguage,
): string[] {
  const examples = PROMPT_EXAMPLE_SENTENCES[language];
  const matches: string[] = [];
  for (const field of fields) {
    const haystack = straighten(field.text);
    for (const example of examples) {
      const needle = straighten(example);
      if (haystack.includes(needle)) {
        matches.push(`${field.field} matches a prompt example verbatim: "${example}"`);
        continue;
      }
      // A whole-sentence match was never the behaviour worth measuring: the
      // model reuses an example's opening clause and finishes it its own way,
      // which a containment check cannot see. Measured 2026-09-07: three
      // consecutive French runs opened their closing sentence with example
      // two's first eleven words while this function reported zero.
      const shared = sharedOpeningWordCount(haystack, needle);
      if (shared >= SHARED_OPENING_WORD_THRESHOLD) {
        matches.push(
          `${field.field} reuses a prompt example's opening ${shared} words: "${firstWords(example, shared)}..."`,
        );
      }
    }
  }
  return matches;
}

export function computeRepetitionMetrics(
  fields: readonly ProseField[],
  language: ReportLanguage,
): RepetitionMetrics {
  const recommendedActions = fields
    .filter((f) => /recommendedActions\[\d+\]$/.test(f.field))
    .map((f) => firstWords(f.text, 5));
  const businessImpact = fields
    .filter((f) => f.field.endsWith('.businessImpact'))
    .map((f) => firstWords(f.text, 2));

  return {
    recommendedActionsTotal: recommendedActions.length,
    recommendedActionsSharingFirstFiveWords: Math.round(
      mostCommonShare(recommendedActions) * recommendedActions.length,
    ),
    businessImpactTotal: businessImpact.length,
    businessImpactSharingFirstTwoWords: Math.round(
      mostCommonShare(businessImpact) * businessImpact.length,
    ),
    verbatimPromptExampleMatches: findVerbatimPromptExampleMatches(fields, language),
  };
}

export function proseFieldsOf(analysis: StoredAnalysisShape): ProseField[] {
  const fields: ProseField[] = [];
  if (typeof analysis.executiveSummary === 'string') {
    fields.push({ field: 'executiveSummary', text: analysis.executiveSummary });
  }
  if (typeof analysis.notes === 'string') {
    fields.push({ field: 'notes', text: analysis.notes });
  }
  (analysis.themes ?? []).forEach((theme, i) => {
    if (typeof theme.title === 'string') {
      fields.push({ field: `themes[${i}].title`, text: theme.title });
    }
    if (typeof theme.businessImpact === 'string') {
      fields.push({ field: `themes[${i}].businessImpact`, text: theme.businessImpact });
    }
    if (Array.isArray(theme.recommendedActions)) {
      theme.recommendedActions.forEach((action, j) => {
        if (typeof action === 'string') {
          fields.push({ field: `themes[${i}].recommendedActions[${j}]`, text: action });
        }
      });
    }
  });
  return fields;
}
