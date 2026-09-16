import { SEVERITY_ORDER } from '../normalize/severity.js';
import type { Finding, FindingCategory } from '../types/findings.js';
import { HOOK_FAMILIES, type HookFamily } from './vocabulary.js';

/**
 * Automatic opening-hook family, plan 019 step 4. Derived from finding
 * categories only, never from model-authored themes, with the locked
 * severity weighting (SEVERITY_ORDER: critical 4, serious 3, moderate 2,
 * minor 1). A family wins only with a strict majority of the weighted
 * total; anything else, including no findings at all, resolves to `mixed`.
 */

const HOOK_FAMILY_CATEGORIES: Record<Exclude<HookFamily, 'mixed'>, readonly FindingCategory[]> = {
  accessibility: ['accessibility'],
  'speed-and-booking': ['performance', 'rendering'],
  'search-and-ai-visibility': ['seo', 'geo'],
  privacy: ['privacy'],
};

const weightedTotal = (
  family: Exclude<HookFamily, 'mixed'>,
  findings: readonly Finding[],
): number =>
  HOOK_FAMILY_CATEGORIES[family].reduce(
    (total, category) =>
      total +
      findings
        .filter((finding) => finding.category === category)
        .reduce((sum, finding) => sum + SEVERITY_ORDER[finding.severity], 0),
    0,
  );

/** Issue #307: the concrete family a single category belongs to, so the
 *  report can check the findings-weighted hook against the category of the
 *  priority it actually ranks first. */
export function hookFamilyForCategory(
  category: FindingCategory,
): Exclude<HookFamily, 'mixed'> | undefined {
  for (const [family, categories] of Object.entries(HOOK_FAMILY_CATEGORIES)) {
    if (categories.includes(category)) return family as Exclude<HookFamily, 'mixed'>;
  }
  return undefined;
}

export interface HookFamilyResolution {
  family: HookFamily;
  /** Weighted total per concrete family, for tests and typed previews. */
  weightedTotals: Record<Exclude<HookFamily, 'mixed'>, number>;
  totalWeight: number;
}

/**
 * Eligible findings are every finding passed in: the caller passes the same
 * findings the report renders, and minor findings contribute weight 1, so a
 * long tail cannot outvote a concentration of critical findings.
 */
export function resolveHookFamily(findings: readonly Finding[]): HookFamilyResolution {
  const weightedTotals = {
    accessibility: weightedTotal('accessibility', findings),
    'speed-and-booking': weightedTotal('speed-and-booking', findings),
    'search-and-ai-visibility': weightedTotal('search-and-ai-visibility', findings),
    privacy: weightedTotal('privacy', findings),
  };
  const totalWeight = Object.values(weightedTotals).reduce((sum, value) => sum + value, 0);

  let family: HookFamily = 'mixed';
  for (const candidate of HOOK_FAMILIES) {
    if (candidate === 'mixed') continue;
    // Strict majority: more than half of the total weight.
    if (weightedTotals[candidate] * 2 > totalWeight) {
      family = candidate;
      break;
    }
  }
  return { family, weightedTotals, totalWeight };
}
