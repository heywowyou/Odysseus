import type { FindingCategory, Severity } from '@odysseus/core';

/**
 * Canonical badge/tile colour maps, taken verbatim from
 * docs/report/report-design-system.md section 3. These hex values are the doc's
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

/** accessibility.color deviates from the doc's literal #9184d9: at the
 *  11px size these tags render at, #9184d9 on #2b2741 measures 4.42:1,
 *  just under WCAG 1.4.3's 4.5:1 minimum for small text (confirmed via
 *  axe-core against the real sas-fernande.fr report,
 *  render-html.axe.test.ts). Swapped for nocturne.css's own
 *  --color-accent-300 token (9.52:1 on the same background) rather than a
 *  new invented hex - same hue family, already a locked token, and this
 *  package's own product cannot ship a color pair its own audit would
 *  flag.
 *
 *  geo.color/geo.bg (added milestone 8.5c) has no mockup entry to
 *  re-derive from - geo postdates docs/report/report-design-system.md's
 *  canonical mockups entirely (trade-off 14 added the FindingCategory
 *  value the same day the mockups were finalized). Rather than invent a
 *  one-off hex, it reuses nocturne.css's second, otherwise-unused accent
 *  hue scale (--color-accent-2-300/-900), the same "reuse an existing
 *  token" reasoning as the accessibility swap above. Re-run
 *  render-html.axe.test.ts once a geo finding is in the fixture to
 *  confirm this pairing also clears 1.4.3 - not assumed just because the
 *  parallel scale mirrors the primary one.
 *
 *  privacy.color/privacy.bg (added 2026-08-24 with the FindingCategory
 *  value itself) is the first entry that could not reuse an existing
 *  token: both accent scales are already spoken for (accessibility,
 *  geo), and the three remaining hues are performance's blue, seo's teal
 *  and rendering's grey. A warm gold is the only clearly distinct hue
 *  left, and privacy postdates the canonical mockups by even further
 *  than geo does, so there is nothing to re-derive from. The pair was
 *  chosen by computing WCAG contrast rather than by eye: #e5c07b on
 *  #332a19 is 8.18:1, and 10.19:1 against the page background - both
 *  well clear of 1.4.3's 4.5:1. render-html.axe.test.ts confirms it
 *  against a real rendered report, the same way the accessibility swap
 *  was confirmed rather than assumed. */
export const CATEGORY: Record<FindingCategory, { color: string; bg: string }> = {
  accessibility: { color: 'var(--color-accent-300)', bg: '#2b2741' },
  performance: { color: '#7fa8d9', bg: '#1f2a38' },
  seo: { color: '#6cbfae', bg: '#1c332e' },
  rendering: { color: '#9397ab', bg: '#292b31' },
  geo: { color: 'var(--color-accent-2-300)', bg: 'var(--color-accent-2-900)' },
  privacy: { color: '#e5c07b', bg: '#332a19' },
};

export const CATEGORY_ORDER: readonly FindingCategory[] = [
  'accessibility',
  'privacy',
  'seo',
  'rendering',
  'performance',
  'geo',
];

/** Shared three-point ramp for any Faible/Moyen/Élevé (or Low/Medium/
 *  High) value that means "how urgent", not only the cover's own
 *  overall-risk badge. Promoted out of cover.ts (2026-08-22, La Corniche
 *  report review) so themes.ts's "Impact commercial" column reuses the
 *  exact same mapping instead of a second, drifting copy - both read the
 *  identical three French words (strings/fr.ts's effortImpactLevels.low/
 *  medium/high and cover.riskLevels.low/medium/high). References SEVERITY
 *  directly rather than repeating its hex values, so the two can never
 *  drift out of sync.
 *
 *  Effort deliberately does NOT use this map: high effort means
 *  expensive, not urgent, so painting it on the same red/amber/green ramp
 *  would tell a reader the opposite of the truth - effort stays plain
 *  text in every template that renders it. */
export const LEVEL_COLOR: Record<'low' | 'medium' | 'high', { color: string; bg: string }> = {
  low: SEVERITY.moderate,
  medium: SEVERITY.serious,
  high: SEVERITY.critical,
};
