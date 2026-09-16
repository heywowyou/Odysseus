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

/** Issue #298: see ReferenceStat.scope. */
export type StatScope =
  { readonly kind: 'rules'; readonly ruleIds: readonly string[] } | { readonly kind: 'category' };

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
  /** Issue #298: what this statistic is actually about, declared rather
   *  than inferred from `category`. A category tag is a slot, not a topic:
   *  a real hotel report cited Baymard's e-commerce cart-abandonment rate
   *  on an accessibility priority about link and image text, a checkout
   *  design uplift on an indexing-blockers priority, and Nestle's
   *  rich-results click-through rate on a priority about broken internal
   *  links, purely because each happened to rank first inside a matching
   *  category with no topical check at all.
   *
   *  `{ kind: 'rules' }` names the rule ids the statistic can speak to.
   *  `{ kind: 'category' }` says the claim really is about the whole
   *  category - a survey about disabled travellers avoiding inaccessible
   *  venues is not about one WCAG rule - and is a decision a reviewer
   *  makes on the record, which is the point of requiring the field.
   *
   *  Checked by packages/report's theme-citation path (themes.ts's
   *  isStatEligibleForTheme) against the rule ids of the specific theme's
   *  own findings. The geo findings-appendix block
   *  (findings-appendix.ts's renderGeoCitationBlock) anchors to a whole
   *  category section rather than one narrow theme and is unaffected. */
  scope: StatScope;
}
