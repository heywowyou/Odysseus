/**
 * Sector-tagged performance/business-metric benchmarks. A second, deliberately
 * separate table from stats.ts's ReferenceStat: stats.ts holds the
 * accessibility/SEO/GEO business-impact citations from "Odysseus
 * Business-Impact Statistics Reference Database", this file holds the
 * page-speed/booking/checkout-friction figures from "Sourced Statistics:
 * Web Performance, Accessibility & GEO" (docs/research/Sourced Statistics
 * Web Performance Accessibility & GEO.md). Both docs overlap on GEO and
 * accessibility ROI case studies; this table deliberately does not
 * duplicate stats.ts's coverage of those, and only imports the
 * performance/booking-conversion figures that table does not already
 * carry.
 *
 * Per that research doc's own recommendation #1: only three sectors have
 * genuinely sector-specific, dated, attributable data (healthcare,
 * hospitality, professional-booking). Every other sector-suggestive
 * figure in the doc is a cross-sector proxy reapplied by vendors, which
 * the doc itself says must never be relabeled as sector-specific - this
 * table only encodes the true cross-sector figures under sector:
 * 'general', scope: 'cross-sector-proxy', never invented as belonging to
 * a sector the doc does not actually attribute them to.
 *
 * Every vendor-blog, single-company case study, or unverifiable-sample
 * figure the research doc itself flags "low weight" / "vendor-origin" /
 * "verify before publishing" (Matterport, Zigpoll, ClearVision Optics,
 * Legal & General, Tesco, CNET, Olo, Revfine, SimplyBook.me) is skipped
 * entirely, not encoded behind a flag - the doc's own recommendation #1
 * treats provenance grading as essential, and this table only holds rows
 * that already clear that bar.
 */

import { z } from 'zod';

export const benchmarkSectorSchema = z.enum(['healthcare', 'hospitality', 'professional-booking', 'general']);
export type BenchmarkSector = z.infer<typeof benchmarkSectorSchema>;

export const benchmarkScopeSchema = z.enum(['sector-specific', 'cross-sector-proxy']);
export type BenchmarkScope = z.infer<typeof benchmarkScopeSchema>;

export const performanceBenchmarkSchema = z.object({
  sector: benchmarkSectorSchema,
  metric: z.string().min(1),
  statistic: z.object({
    value: z.number(),
    unit: z.string().min(1),
  }),
  source: z.string().min(1),
  sourceDate: z.string().min(1),
  /** Optional: only populated when the research doc gives an explicit
   *  URL. Several doc entries cite a source (e.g. a PMC article ID) with
   *  no literal URL string, and inventing one is exactly the kind of
   *  unchecked fact rule 1 forbids - see CLAUDE.md trade-off 15's same
   *  reasoning for stats.ts's optional `year`. */
  sourceUrl: z.string().min(1).optional(),
  scope: benchmarkScopeSchema,
  applicability: z.object({
    /** A free-text band (e.g. "under EUR 1M") or the literal sentinel
     *  'any' when the research doc gives no revenue-band qualification
     *  at all - every entry below uses 'any', since none of the sourced
     *  studies segment by client revenue. */
    revenueBand: z.string().min(1),
    notes: z.string(),
  }),
});
export type PerformanceBenchmark = z.infer<typeof performanceBenchmarkSchema>;

const RAW_BENCHMARKS: PerformanceBenchmark[] = [
  // --- Sector-specific (doc recommendation #1's only three qualifying sectors) ---
  {
    sector: 'healthcare',
    metric: 'appointment-no-show-rate-reduction-online-vs-phone-booking',
    statistic: { value: 70, unit: 'percent-relative-reduction' },
    source:
      'Frontiers in Digital Health / PMC (PMC12081397), 2025 - ophthalmology private practice (16,894 appointments) and university hospital (81,173 appointments), 20-month retrospective study',
    sourceDate: '2025',
    scope: 'sector-specific',
    applicability: {
      revenueBand: 'any',
      notes:
        'Online-booked appointments no-show at 1.8% versus 5.9% for phone-booked. The strongest sector-specific dataset in the research pass, though the hospital-setting arm reversed (14.3% online vs 11.2% offline); strongest for private-practice/appointment SMBs, not hospitals.',
    },
  },
  {
    sector: 'hospitality',
    metric: 'booking-abandonment-after-poor-digital-experience',
    statistic: { value: 52, unit: 'percent' },
    source: 'SiteMinder Changing Traveller Report 2025 (12,000 travelers, 14 markets)',
    sourceDate: '2025',
    scope: 'sector-specific',
    applicability: {
      revenueBand: 'any',
      notes:
        'More than half of travelers abandoned an online booking after a bad experience, not price. Top reasons: security concerns 22%, complex processes 18%, long load times 18%. Gen Z abandons at 70%, the highest of any segment.',
    },
  },
  {
    sector: 'professional-booking',
    metric: 'booking-abandonment-due-to-difficulty',
    statistic: { value: 71, unit: 'percent' },
    source: 'Zenoti 2025 Salon & Spa Consumer Survey (1,500+ customers)',
    sourceDate: '2025',
    scope: 'sector-specific',
    applicability: {
      revenueBand: 'any',
      notes: 'Medspa segment specifically reports 79% abandonment for the same reason.',
    },
  },
  {
    sector: 'professional-booking',
    metric: 'online-booking-adoption-rate-median',
    statistic: { value: 26, unit: 'percent' },
    source: 'Zenoti 2026 Beauty & Wellness Benchmark Report',
    sourceDate: '2026',
    scope: 'sector-specific',
    applicability: {
      revenueBand: 'any',
      notes:
        'Median salon online-booking adoption; top-performing salons reach 61%. Nail studios: 74% top vs 44% median. Medical spas: 32% top vs 13% median.',
    },
  },

  // --- Cross-sector proxies (never relabeled as sector-specific; used only when a caller explicitly asks for sector: 'general') ---
  {
    sector: 'general',
    metric: 'conversion-uplift-per-0.1s-mobile-speed-improvement-retail',
    statistic: { value: 8.4, unit: 'percent' },
    source: 'Deloitte Digital & Google, "Milliseconds Make Millions," 2020 (37 brand sites, 30.5M sessions)',
    sourceDate: '2020',
    sourceUrl: 'https://web.dev/case-studies/milliseconds-make-millions',
    scope: 'cross-sector-proxy',
    applicability: {
      revenueBand: 'any',
      notes:
        'Retail vertical, large-enterprise sample; predates the Core Web Vitals metric set. Average order value also rose 9.2% in this vertical.',
    },
  },
  {
    sector: 'general',
    metric: 'conversion-uplift-per-0.1s-mobile-speed-improvement-travel',
    statistic: { value: 10.1, unit: 'percent' },
    source: 'Deloitte Digital & Google, "Milliseconds Make Millions," 2020 (37 brand sites, 30.5M sessions)',
    sourceDate: '2020',
    sourceUrl: 'https://web.dev/case-studies/milliseconds-make-millions',
    scope: 'cross-sector-proxy',
    applicability: {
      revenueBand: 'any',
      notes:
        'Travel vertical, large-enterprise sample; predates the Core Web Vitals metric set. Average order value rose only 1.9% in this vertical, unlike retail.',
    },
  },
  {
    sector: 'general',
    metric: 'average-checkout-form-field-count',
    statistic: { value: 11.3, unit: 'fields' },
    source: 'Baymard Institute, "Checkout Optimization: Minimize Form Fields," 2024',
    sourceDate: '2024',
    sourceUrl: 'https://baymard.com/blog/checkout-flow-average-form-fields',
    scope: 'cross-sector-proxy',
    applicability: {
      revenueBand: 'any',
      notes:
        'Large-retailer ecommerce benchmark, down from 11.8 (2021) and 12.7 (2019). Most sites need only about 8 fields; average checkout is 5.1 steps, stable since 2012.',
    },
  },
  {
    sector: 'general',
    metric: 'cart-abandonment-rate',
    statistic: { value: 70.19, unit: 'percent' },
    source: 'Baymard Institute, cart abandonment rate statistics (49-study aggregate, 2006-2023)',
    sourceDate: '2023',
    scope: 'cross-sector-proxy',
    applicability: {
      revenueBand: 'any',
      notes:
        'Ecommerce cross-sector benchmark. Travel/hospitality runs meaningfully higher (~81.7%, hotel-specific ~80% per Revinate/Hotel Online, weaker provenance) - not substituted here for the hospitality-tagged rows above.',
    },
  },
];

export const REFERENCE_PERFORMANCE_BENCHMARKS: readonly PerformanceBenchmark[] = RAW_BENCHMARKS.map((entry) =>
  performanceBenchmarkSchema.parse(entry),
);

/**
 * Pure lookup, no fallback. A sector/metric pair with no matching row
 * returns null, and the caller must omit the quantitative claim entirely
 * rather than substitute a different sector's figure - see this file's
 * header. No LLM involvement in selection, mirroring assessObligations()
 * and select.ts's selectReferenceStats().
 */
export function getSectorBenchmark(sector: BenchmarkSector, metric: string): PerformanceBenchmark | null {
  return REFERENCE_PERFORMANCE_BENCHMARKS.find((entry) => entry.sector === sector && entry.metric === metric) ?? null;
}
