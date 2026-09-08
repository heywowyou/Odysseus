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
 *  shadow reviewer.
 *
 *  Issue #106 adds the construction level: the fa1a598 fix removed the
 *  word-level tic, and the templating moved one level down into the
 *  grammar. The stored post-fix analyses open 20/21 (Villas Foch FR) and
 *  24/26 (Briketenia FR) action entries on a subject immediately followed
 *  by the devoir modal, while the word-level opening share reports near
 *  zero because "Les boutons", "Les zones", "Le temps" all differ. English
 *  shows the same shift at the sentence end: many actions close on one
 *  final-clause formula (", and your technical provider can..."). The two
 *  new counts catch both, and constructionRepetitionFlags interprets them
 *  against the documented limits. Still measurement only: nothing here
 *  rejects a response. */
export interface RepetitionMetrics {
  recommendedActionsTotal: number;
  recommendedActionsSharingFirstFiveWords: number;
  /** Entries whose opening sentence reaches a present form of devoir
   *  (doit/doivent/doive) within the first DEVOIR_MODAL_POSITION_LIMIT
   *  words, i.e. the subject + devoir frame the issue describes. */
  recommendedActionsOpeningWithDevoirModal: number;
  /** Entries sharing the most common sentence-final tail, plus that tail
   *  (empty string when no tail recurs or entries carry no final comma
   *  clause). */
  recommendedActionsSharingSentenceFinalTail: number;
  recommendedActionsMostSharedSentenceFinalTail: string;
  businessImpactTotal: number;
  businessImpactSharingFirstTwoWords: number;
  verbatimPromptExampleMatches: string[];
  /** Human-readable construction-level flags for the lint output, empty
   *  when the report is inside both limits. */
  constructionRepetitionFlags: string[];
}

/**
 * An action entry counts as opening on the subject + devoir construction
 * when one of these forms appears early in its first sentence. Only the
 * present forms matter: the stored tic is "X doit être/Y doivent recevoir",
 * and the participle/infinitive forms (dû, devoir) would match ordinary
 * nouns and infinitive clauses.
 */
const DEVOIR_MODAL_PRESENT_FORMS = new Set(['doit', 'doivent', 'doive']);

/**
 * How far into the sentence the devoir form may sit and still read as the
 * opening construction. Measured on the stored post-fix analyses: subject
 * phrases before the verb run from 2 to 16 words ("Les titres qui ont été
 * mis en avant... doivent") because remediation subjects carry relative
 * clauses. The limit must cover that span. The cost of a generous limit is
 * a rare miscount of an action opening on a purpose clause ("Pour corriger
 * X, le formulaire doit..."); the 2/3 share limit absorbs scattered
 * miscounts, and a lint metric needs recall more than it needs lexical
 * purity.
 */
const DEVOIR_MODAL_POSITION_LIMIT = 18;

/**
 * Flag a report whose share of subject + devoir openings exceeds 2/3.
 * Calibrated against every stored analysis (2026-09-08): the templated
 * post-fa1a598 files sit at 67-100%, while the register document's own
 * worked exemplar actions (docs/rules/report-writing-style.md section 6)
 * reach 6/10 = 60% - natural remediation-register usage that must stay a
 * pass. Two thirds separates a recurring frame from ordinary usage.
 */
export const DEVOIR_OPENING_SHARE_LIMIT = 2 / 3;

/**
 * The sentence-final tail of an entry is the first TAIL_WORD_COUNT words
 * after its last comma. Four words: long enough that ordinary connective
 * variation breaks the match (et/que/afin differ at word one), short
 * enough to group ", and your technical provider can/should..." into one
 * tail despite the verb differing at word five.
 */
const TAIL_WORD_COUNT = 4;

/**
 * Flag a report whose most common sentence-final tail exceeds 1/4 of the
 * action entries. Calibrated against every stored analysis: templated
 * files share one tail across 26-100% of entries, acceptable files at or
 * below 24%. Above a quarter, one closing formula is carrying several
 * themes at once, which is the "client reads the scaffold" defect.
 */
export const SHARED_SENTENCE_FINAL_TAIL_SHARE_LIMIT = 1 / 4;

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

/** The opening words of the clause that closes the entry: everything after
 *  its last comma, punctuation-trimmed and normalized the same way as the
 *  verbatim comparison (lowercase, straightened apostrophes), so grouped
 *  tails differ only when the words really differ. An entry without a
 *  comma has no final clause and yields an empty tail: its ending is its
 *  whole sentence, and identical one-clause endings already share their
 *  first five words, which the word-level metric counts - letting the
 *  whole sentence stand in for the tail here would double-report shared
 *  openings as shared endings. */
function sentenceFinalTail(text: string): string {
  const lastComma = text.lastIndexOf(',');
  if (lastComma < 0) return '';
  const words = wordsOf(straighten(text.slice(lastComma + 1)).replace(/[.!?]?\s*$/, ''));
  return words.slice(0, TAIL_WORD_COUNT).join(' ');
}

/** True when the entry's first sentence reaches a present form of devoir
 *  within DEVOIR_MODAL_POSITION_LIMIT words, i.e. it opens on a subject
 *  (however long its relative clauses) whose finite verb is the devoir
 *  modal. Only the entry's opening sentence counts: the tic is where the
 *  action starts, not whether devoir appears anywhere later. */
function opensWithDevoirModal(text: string): boolean {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? '';
  const words = wordsOf(firstSentence.replace(/[.,;:!?]/g, ''));
  const position = words.findIndex((word) => DEVOIR_MODAL_PRESENT_FORMS.has(word));
  return position >= 0 && position < DEVOIR_MODAL_POSITION_LIMIT;
}

/** The most common tail and how many entries carry it. An empty tail means
 *  "this entry has no final comma clause", which is an absence of tail, not
 *  a shared one, so callers treat an empty winner as count zero. */
function mostCommonTail(tails: readonly string[]): { tail: string; count: number } {
  const counts = new Map<string, number>();
  for (const tail of tails) {
    counts.set(tail, (counts.get(tail) ?? 0) + 1);
  }
  let best = { tail: '', count: 0 };
  for (const [tail, count] of counts) {
    if (count > best.count) best = { tail, count };
  }
  return best;
}

/**
 * Below these absolute counts a share carries no signal: a one-action
 * report shares 100% of its tails no matter how varied the prose is. The
 * raw counts stay reported either way; only the flags need the floor.
 */
const DEVOIR_FLAG_MIN_COUNT = 4;
const TAIL_FLAG_MIN_COUNT = 3;

function findConstructionRepetitionFlags(
  devoirOpenings: number,
  tails: readonly string[],
): string[] {
  const flags: string[] = [];
  const total = tails.length;
  if (total === 0) return flags;
  if (
    devoirOpenings >= DEVOIR_FLAG_MIN_COUNT &&
    devoirOpenings / total > DEVOIR_OPENING_SHARE_LIMIT
  ) {
    flags.push(
      `${devoirOpenings}/${total} recommendedActions open on the subject + devoir construction (limit: more than 2/3 of entries)`,
    );
  }
  const { tail, count } = mostCommonTail(tails);
  if (
    tail !== '' &&
    count >= TAIL_FLAG_MIN_COUNT &&
    count / total > SHARED_SENTENCE_FINAL_TAIL_SHARE_LIMIT
  ) {
    flags.push(
      `${count}/${total} recommendedActions end on the same final clause "${tail}" (limit: more than 1/4 of entries)`,
    );
  }
  return flags;
}

export function computeRepetitionMetrics(
  fields: readonly ProseField[],
  language: ReportLanguage,
): RepetitionMetrics {
  const recommendedActionFields = fields.filter((f) => /recommendedActions\[\d+\]$/.test(f.field));
  const recommendedActions = recommendedActionFields.map((f) => firstWords(f.text, 5));
  const devoirOpenings = recommendedActionFields.filter((f) => opensWithDevoirModal(f.text)).length;
  const tails = recommendedActionFields.map((f) => sentenceFinalTail(f.text));
  const sharedTail = mostCommonTail(tails);
  const businessImpact = fields
    .filter((f) => f.field.endsWith('.businessImpact'))
    .map((f) => firstWords(f.text, 2));

  return {
    recommendedActionsTotal: recommendedActions.length,
    recommendedActionsSharingFirstFiveWords: Math.round(
      mostCommonShare(recommendedActions) * recommendedActions.length,
    ),
    recommendedActionsOpeningWithDevoirModal: devoirOpenings,
    recommendedActionsSharingSentenceFinalTail: sharedTail.tail === '' ? 0 : sharedTail.count,
    recommendedActionsMostSharedSentenceFinalTail: sharedTail.tail,
    businessImpactTotal: businessImpact.length,
    businessImpactSharingFirstTwoWords: Math.round(
      mostCommonShare(businessImpact) * businessImpact.length,
    ),
    verbatimPromptExampleMatches: findVerbatimPromptExampleMatches(fields, language),
    constructionRepetitionFlags: findConstructionRepetitionFlags(devoirOpenings, tails),
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
