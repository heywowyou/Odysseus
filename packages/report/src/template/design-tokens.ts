import type { FindingCategory, Severity } from '@odysseus/core';

/**
 * Canonical badge/tile colour maps, taken verbatim from
 * docs/report-design-system.md section 3. These hex values are the doc's
 * own source of truth for this specific per-badge palette (distinct from
 * nocturne.css's own token set) and are inlined into markup the same way
 * report.reference.html's own {{ s.bg }}/{{ s.color }} placeholders are -
 * "nocturne.css is locked" governs that file, not this module.
 *
 * Every severity/category badge pairs a colour with a text label
 * (never colour alone), which is what satisfies WCAG 1.4.1 here - no
 * separate glyph shape is needed on top of that, unlike the pre-redesign
 * severity-badge.ts.
 */
export const SEVERITY: Record<Severity, { color: string; bg: string }> = {
  critical: { color: '#d97b82', bg: '#34232a' },
  serious: { color: '#dba36c', bg: '#362a1c' },
  moderate: { color: '#d6c96e', bg: '#35331c' },
  minor: { color: '#b2b6ca', bg: '#292b31' },
};

/** 'geo' has no colour entry: docs/report-design-system.md section 3's
 *  CATEGORY_ORDER (used verbatim by findings-appendix.ts) does not
 *  include it, matching CLAUDE.md trade-off 14 (geo findings exist but
 *  are not yet rendered in the PDF appendix).
 *
 *  accessibility.color deviates from the doc's literal #9184d9: at the
 *  11px size these tags render at, #9184d9 on #2b2741 measures 4.42:1,
 *  just under WCAG 1.4.3's 4.5:1 minimum for small text (confirmed via
 *  axe-core against the real sas-fernande.fr report,
 *  render-html.axe.test.ts). Swapped for nocturne.css's own
 *  --color-accent-300 token (9.52:1 on the same background) rather than a
 *  new invented hex - same hue family, already a locked token, and this
 *  package's own product cannot ship a color pair its own audit would
 *  flag. */
export const CATEGORY: Record<Exclude<FindingCategory, 'geo'>, { color: string; bg: string }> = {
  accessibility: { color: 'var(--color-accent-300)', bg: '#2b2741' },
  performance: { color: '#7fa8d9', bg: '#1f2a38' },
  seo: { color: '#6cbfae', bg: '#1c332e' },
  rendering: { color: '#9397ab', bg: '#292b31' },
};

export const CATEGORY_ORDER: readonly Exclude<FindingCategory, 'geo'>[] = [
  'accessibility',
  'seo',
  'rendering',
  'performance',
];
