import type { FindingCategory, Grade, Severity } from '@odysseus/core';

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
 *
 * Plan 039 (2026-09-11): the ground moved from the retired Nocturne
 * #161826 to the site's dark near-navy #0e141c, and every tile fill was
 * re-derived as the documented 0.12-alpha tint of its text colour over
 * that ground. The four severity text hexes are the plan 023 hues,
 * re-verified on the new tints (worst pair: critical at 5.38:1); they
 * deliberately do not match the dashboard's severity shades, and that
 * divergence is recorded in trade-offs.md#81 rather than harmonized.
 */
export const SEVERITY: Record<Severity, { color: string; bg: string }> = {
  critical: { color: '#d97b82', bg: '#262028' },
  serious: { color: '#dba36c', bg: '#272526' },
  moderate: { color: '#d6c96e', bg: '#262a26' },
  minor: { color: '#b2b6ca', bg: '#222731' },
};

/** Semantic letter-grade palette shared by the paid report and the outreach
 * preview. The hues are existing Odysseus tokens rather than a second visual
 * system: the established Odysseus success green, sky blue, the severity
 * yellow, and the severity red. The A green deliberately does not reuse the
 * dossier's signal token, whose meaning remains reserved for action marks.
 * Backgrounds use the same restrained dark tints as the report's other
 * measured signals. */
export const GRADE: Record<Grade, { color: string; bg: string }> = {
  A: { color: '#4cc98a', bg: '#152a29' },
  B: { color: 'var(--color-accent-300)', bg: '#1b2b37' },
  C: SEVERITY.moderate,
  D: SEVERITY.critical,
};

/** accessibility.color stays var(--color-accent-300): under plan 039 that
 *  token is sky-300 #7dd3fc, and on the re-derived 0.12 tint fill #1b2b37
 *  it measures 8.70:1 - comfortably over 1.4.3's 4.5:1 at the 11px size
 *  these tags render at (the original swap away from the literal accent
 *  happened for the same reason; the gate is still
 *  render-html.axe.test.ts against a real rendered report).
 *
 *  geo.color/geo.bg (added milestone 8.5c) has no mockup entry to
 *  re-derive from - geo postdates docs/report/report-design-system.md's
 *  canonical mockups entirely (trade-off 14 added the FindingCategory
 *  value the same day the mockups were finalized). It reuses
 *  nocturne.css's second accent hue scale (--color-accent-2-300/-900),
 *  which plan 039 keeps unchanged as the geo category's own violet
 *  family: #d2cefd on #2b293a measures 9.44:1 on the new ground.
 *
 *  privacy.color/privacy.bg (added 2026-08-24 with the FindingCategory
 *  value itself) could not reuse an existing token: both accent scales
 *  are already spoken for (accessibility, geo), and the three remaining
 *  hues are performance's blue, seo's teal and rendering's grey. A warm
 *  gold is the only clearly distinct hue left. Plan 039 re-derives the
 *  fill with the same 0.12-tint rule as every other pair (#e5c07b on
 *  #282927 is 8.46:1; 10.71:1 against the page background) - both well
 *  clear of 1.4.3's 4.5:1. render-html.axe.test.ts confirms it against
 *  a real rendered report, the same way the accessibility swap was
 *  confirmed rather than assumed. */
export const CATEGORY: Record<FindingCategory, { color: string; bg: string }> = {
  accessibility: { color: 'var(--color-accent-300)', bg: '#1b2b37' },
  performance: { color: '#7fa8d9', bg: '#1c2633' },
  seo: { color: '#6cbfae', bg: '#19292e' },
  rendering: { color: 'var(--color-neutral-400)', bg: 'var(--color-neutral-900)' },
  geo: { color: 'var(--color-accent-2-300)', bg: 'var(--color-accent-2-900)' },
  privacy: { color: '#e5c07b', bg: '#282927' },
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
 *  medium/high and metadata.riskLevels.low/medium/high). References SEVERITY
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
