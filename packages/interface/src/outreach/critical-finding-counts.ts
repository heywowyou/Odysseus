import type { Finding, FindingCategory } from '@odysseus/core';

const CATEGORY_ORDER: readonly FindingCategory[] = [
  'accessibility',
  'seo',
  'performance',
  'geo',
  'rendering',
  'privacy',
];

/**
 * Existing draft plumbing transports categories as a string array. Until that
 * port is widened, one occurrence represents one distinct critical finding.
 * The template counts occurrences and therefore never accepts a free numeric
 * value. The three strongest non-zero categories are selected deterministically.
 */
export function criticalFindingCategoryOccurrences(
  findings: readonly Finding[],
): FindingCategory[] {
  const counts = new Map<FindingCategory, number>();
  for (const finding of findings) {
    if (finding.severity !== 'critical') continue;
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  }

  return CATEGORY_ORDER.map((category) => ({ category, count: counts.get(category) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
    )
    .slice(0, 3)
    .flatMap(({ category, count }) => Array.from({ length: count }, () => category));
}
