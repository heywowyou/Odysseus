import { REFERENCE_STAT_TABLE } from './stats.js';
import type { ReferenceStat, StatCategory, StatSector } from './types.js';

/**
 * Selects citable stats for one category. Filter = category match
 * only; sort = sector-fit then confidence. A hospitality request never
 * excludes the general rows for that category - it only ranks its own
 * sector-tagged rows first, per the research doc's own framing that
 * cross-sector multipliers stay the scalable spine while hospitality
 * adds qualitative/behavioral evidence on top (section 1.2/2.2/3.2).
 * Established rows rank before emerging ones, mirroring the doc's own
 * Stage 1 (established spine) before Stage 3 (quarantined emerging)
 * build order.
 *
 * Pure: no I/O, callable offline exactly like assessObligations.
 *
 * `strictSector: true` (P0.2, 2026-08-21 La Corniche feedback pass)
 * excludes `general` rows entirely instead of only ranking them second -
 * a deliberate move away from cross-sector benchmarks in the report's
 * priority cards, not a re-matching fix. A hospitality report citing a
 * Baymard e-commerce cart-abandonment stat on a labeling defect actively
 * hurt credibility more than citing nothing; the report path (themes.ts,
 * findings-appendix.ts's geo citation) now always passes this. Default
 * stays permissive so any other future caller keeps the original
 * rank-with-fallback behavior without an explicit opt-in.
 */
export function selectReferenceStats(
  category: StatCategory,
  sector: StatSector,
  options: { strictSector?: boolean } = {},
): readonly ReferenceStat[] {
  return REFERENCE_STAT_TABLE.filter((stat) => stat.category.includes(category))
    .filter((stat) => !options.strictSector || stat.sector === sector)
    .slice()
    .sort((a, b) => {
      const sectorRank = (stat: ReferenceStat): number =>
        stat.sector === sector ? 0 : stat.sector === 'general' ? 1 : 2;
      const sectorDiff = sectorRank(a) - sectorRank(b);
      if (sectorDiff !== 0) return sectorDiff;

      const confidenceRank = (stat: ReferenceStat): number =>
        stat.confidence === 'established' ? 0 : 1;
      return confidenceRank(a) - confidenceRank(b);
    });
}
