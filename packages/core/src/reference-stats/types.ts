/**
 * Types for the business-impact reference-stat table, milestone 8.5b.
 * New, standalone shapes - does not touch the locked findings.ts or
 * llm-output.ts contracts. See docs/research/Odysseus Business-Impact
 * Statistics Reference Database Accessibility SEO & GEO.md for the
 * source vetting behind every field here, and CLAUDE.md trade-off 15
 * for why this table exists as compiled TS rather than JSON config.
 *
 * Data + pure functions only in this milestone: nothing here is wired
 * into packages/llm's prompts or packages/report's templates yet. That
 * wiring is milestone 8.5c.
 */

/** 'performance' added for B1 (report-feedback-haaitza.md, 2026-08-17):
 *  the three Deloitte page-speed/conversion stats were originally tagged
 *  accessibility/seo purely because CLAUDE.md trade-off 16 gave
 *  performance/rendering themes no citation slot at all - a mistagging
 *  that showed up as the speed stat attaching to an unrelated video-
 *  captions theme and a broken-links theme, twice, in a real report. See
 *  themes.ts's citation loop for the corresponding eligibility change. */
export type StatCategory = 'accessibility' | 'seo' | 'geo' | 'performance';

export type StatSector = 'general' | 'hospitality';

/**
 * 'established' = the research doc's "SAFE TO CITE BY NAME" tier.
 * 'emerging' = the doc's "cite only as early data suggests, name the
 * source, flag limits" tier. Everything the doc marks "directionally
 * useful but not citable" or "not citable" is skipped entirely by
 * stats.ts, never encoded as a third tier here.
 */
export type StatConfidence = 'established' | 'emerging';

/**
 * 'scales-down': a ratio usable in a per-client calculator (a
 * percentage or multiplier applied to a client's own revenue or
 * traffic). 'context-only': a named case study or an aggregate that
 * must never be divided into a per-client number.
 */
export type StatScalability = 'scales-down' | 'context-only';

export type RatioKind =
  | 'conversion-uplift-per-0.1s'
  | 'aov-uplift-per-0.1s'
  | 'checkout-uplift'
  | 'cart-abandonment-rate'
  | 'ctr-with-ai-summary'
  | 'ctr-without-ai-summary'
  | 'visibility-uplift';

export interface Bilingual {
  fr: string;
  en: string;
}

export interface ReferenceStat {
  id: string;
  /** Non-empty. Some stats (Deloitte, Baymard, Pew) double as anchors
   *  for more than one category per the research doc itself - modeled
   *  as one row with multiple categories rather than duplicated rows,
   *  so the citation text can't drift between copies on a future
   *  edit. */
  category: readonly StatCategory[];
  /** 'hospitality' rows supplement general rows for that category,
   *  they never replace them - see select.ts. */
  sector: StatSector;
  confidence: StatConfidence;
  scalability: StatScalability;
  source: string;
  /** Publication year, when the research doc gives one. Left undefined
   *  rather than guessed for sources the doc itself calls "archived" or
   *  undated (the Google-documented Nestlé/Rotten Tomatoes case studies) -
   *  inventing a year would be exactly the kind of unchecked fact rule 1
   *  forbids. An undated, wrong-sector case study (the W3C-documented
   *  Legal & General row) was removed from the table entirely rather than
   *  kept undated, per item 1.5. */
  year?: number;
  /** Verbatim, checkable citation sentence - not paraphrased. This is
   *  the exact text a report may one day splice in, the same way
   *  legal content is spliced rather than written by the model
   *  (CLAUDE.md trade-off 11). */
  citation: Bilingual;
  /** Present only when scalability === 'scales-down'. Stored as a
   *  decimal fraction, e.g. 0.101 for 10.1%. */
  ratio?: { kind: RatioKind; value: number };
  /** report-feedback-la-corniche.md item 1.1: category alone is too
   *  coarse a match for a stat whose real topic is narrower than the
   *  whole category it's tagged into - a real report cited the Pew
   *  AI-overview click-through-rate stat (category includes 'seo') on a
   *  "mentions légales manquantes" (missing SIREN) priority, because
   *  that theme happened to be the highest-ranked 'seo' theme and
   *  selectReferenceStats has no way to know the stat is about search
   *  click behavior, not legal notices. Present only on stats whose
   *  relevance is confirmed narrower than their category tag; absent
   *  (the common case) means category match alone is trusted, as
   *  before. Checked only by packages/report's theme-citation path
   *  (themes.ts's isStatEligibleForTheme) against the rule IDs of the
   *  specific theme's own findings - the geo findings-appendix section
   *  (findings-appendix.ts's renderGeoCitationBlock) anchors to a whole
   *  category section rather than one narrow theme and is unaffected. */
  eligibleRuleIds?: readonly string[];
}
