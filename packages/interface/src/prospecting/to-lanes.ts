/**
 * Splits a candidate list into `laneCount` round-robin lanes, the shape
 * scan-site.ts uses: round-robin rather than contiguous chunks so a run whose
 * candidates arrive sorted by name or id does not put one slow host's
 * neighbours all in one lane.
 *
 * The one shared implementation for the prescan, redirect reconciliation,
 * qualification and contact pipelines. A `laneCount` below one collapses to a
 * single lane rather than dropping every candidate.
 */
export function toLanes<T>(items: readonly T[], laneCount: number): T[][] {
  const lanes: T[][] = Array.from({ length: Math.max(1, laneCount) }, () => []);
  items.forEach((item, index) => {
    lanes[index % lanes.length]?.push(item);
  });
  return lanes;
}
