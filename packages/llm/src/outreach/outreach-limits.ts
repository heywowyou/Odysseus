/**
 * The shape doctrine gives each outreach touch. `docs/rules/outreach-rules.md`
 * section 6 names the touch sequence's content ("one new piece of
 * information per touch") but did not, as of milestone 9c plan 010, carry
 * the word/sentence/link numbers below - those existed only in the plan
 * document. Plan 010's commit 8 amends section 6 with a touch-shape table
 * stating these same numbers, at which point this becomes the enforcement
 * of a doctrine document rather than the sole source of the limit.
 * outreach-limits.test.ts asserts the two stay in agreement.
 */
export interface OutreachTouchLimits {
  minWords: number;
  maxWords: number;
  /** Exact sentence count required, or null when the touch has no single
   *  sentence-count rule (touch 1's three fields are bounded individually
   *  by the zod schema instead). */
  sentences: number | null;
  maxLinks: number;
  subjectMaxChars: number | null;
}

export const OUTREACH_TOUCH_LIMITS: Readonly<Record<1 | 2 | 3, OutreachTouchLimits>> = {
  1: { minWords: 60, maxWords: 90, sentences: null, maxLinks: 1, subjectMaxChars: 78 },
  2: { minWords: 0, maxWords: 60, sentences: 2, maxLinks: 0, subjectMaxChars: null },
  3: { minWords: 0, maxWords: 40, sentences: 1, maxLinks: 0, subjectMaxChars: null },
};
