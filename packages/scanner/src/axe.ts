import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from 'playwright';

/**
 * These five tags are additive, not hierarchical: WCAG 2.2 AA coverage
 * requires all of 2.0 A/AA, 2.1 A/AA, and the new 2.2 AA criteria. Note
 * that automated axe-core coverage of WCAG 2.2 AA is inherently partial;
 * several criteria (e.g. Focus Not Obscured, Consistent Help) cannot be
 * checked by a static rule engine and still require manual verification.
 */
export const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

// @axe-core/playwright only exports AxeBuilder, not the AxeResults shape.
// Derive it from analyze()'s return type instead of adding axe-core itself
// as a second explicit dependency just for a type.
export type AxeResults = Awaited<ReturnType<InstanceType<typeof AxeBuilder>['analyze']>>;

/** Runs axe-core against an already-rendered page. No navigation of its
 *  own: the caller is expected to pass a page that is already loaded, so
 *  this never counts as an additional page load. */
export async function runAxe(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags([...WCAG22AA_TAGS]).analyze();
}
