/**
 * The business-impact reference-stat table, milestone 8.5b. Static,
 * compiled TS constants - not JSON. This mirrors compliance/regimes.ts
 * (narrative content an implementer edits deliberately and reviews in a
 * diff) rather than prospecting/config/naf-sector-allowlist.json
 * (operator-editable, versioned config read at runtime). A citation's
 * exact wording is not a knob an operator flips.
 *
 * Source of truth for every row: docs/research/Odysseus Business-Impact
 * Statistics Reference Database Accessibility SEO & GEO.md. Only rows
 * the doc tags "SAFE TO CITE BY NAME" or, for GEO, "emerging / cite only
 * as early data suggests" are encoded here. Everything the doc marks
 * "directionally useful but not citable" or "not citable" is left out
 * entirely, not encoded behind a flag: Accenture disability-inclusion,
 * the Click-Away Pound £-billions aggregate, the Tesco anecdote, Seer's
 * ChatGPT conversion case study, Visibility Labs, Adobe Digital
 * Insights, Ahrefs/GrowthSRC SEO CTR-drop corroborators, any
 * structured-data-to-AI-citation number, and llms.txt claims.
 *
 * "Web Standards Commission" (wsc.us.org) and its $13-18bn figure are
 * excluded by omission - there is no row here, flagged or otherwise,
 * that references it, and stats.test.ts asserts no citation or source
 * text contains its name as a regression trip-wire. See CLAUDE.md
 * trade-off 15.
 *
 * Princeton's GEO visibility paper is tagged 'emerging' below despite
 * being peer-reviewed research the source doc itself calls
 * "well-established" - a deliberate downgrade, because it measures
 * visibility within a controlled benchmark, not traffic or revenue, and
 * the doc's own Stage 3 recommendation is to quarantine every
 * GEO-adjacent number as "Emerging Research." Revisit only if GEO
 * acquires a peer-reviewed revenue study (the doc's own promotion
 * criterion).
 *
 * Milestone 8.5c wired this table into packages/report's audit-report
 * templates (themes.ts, findings-appendix.ts) via selectReferenceStats,
 * fully deterministically - see CLAUDE.md trade-off 16. It remains
 * report-only: milestone 9c's outreach generation, not yet built, must
 * never import this table or selectReferenceStats/estimateRevenueImpact.
 * docs/llm-layer-rules.md section 11's "No statistics" rule for outreach
 * is deliberately stricter than the paid report path.
 */

import type { ReferenceStat } from './types.js';

function bilingual(fr: string, en: string): { fr: string; en: string } {
  return { fr, en };
}

export const REFERENCE_STAT_TABLE: readonly ReferenceStat[] = [
  {
    id: 'deloitte-speed-conversion-retail-2020',
    // B1: retagged from ['accessibility', 'seo'] - this stat is about
    // page speed and conversion, not accessibility or SEO. It was
    // originally tagged that way only because those were the two
    // categories themes.ts could attach a citation to at all.
    category: ['performance'],
    sector: 'general',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Deloitte & Google, Milliseconds Make Millions',
    year: 2020,
    citation: bilingual(
      "Une amélioration de 0,1 seconde de la vitesse mobile a été associée à une hausse de 8,4 % des conversions dans le commerce de détail, sur la base d'environ 30 millions de sessions utilisateur réparties sur 37 marques (Deloitte & Google, Milliseconds Make Millions, 2020).",
      'A 0.1-second improvement in mobile site speed was associated with a +8.4% increase in retail conversions, based on roughly 30 million user sessions across 37 brands (Deloitte & Google, Milliseconds Make Millions, 2020).',
    ),
    ratio: { kind: 'conversion-uplift-per-0.1s', value: 0.084 },
  },
  {
    id: 'deloitte-speed-conversion-travel-2020',
    // B1: same retag as deloitte-speed-conversion-retail-2020 above.
    category: ['performance'],
    sector: 'hospitality',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Deloitte & Google, Milliseconds Make Millions',
    year: 2020,
    citation: bilingual(
      "Une amélioration de 0,1 seconde de la vitesse mobile a été associée à une hausse de 10,1 % des conversions dans le secteur du voyage (Deloitte & Google, Milliseconds Make Millions, 2020).",
      'A 0.1-second improvement in mobile site speed was associated with a +10.1% increase in travel-sector conversions (Deloitte & Google, Milliseconds Make Millions, 2020).',
    ),
    ratio: { kind: 'conversion-uplift-per-0.1s', value: 0.101 },
  },
  {
    id: 'deloitte-aov-retail-2020',
    // B1: same retag as deloitte-speed-conversion-retail-2020 above.
    category: ['performance'],
    sector: 'general',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Deloitte & Google, Milliseconds Make Millions',
    year: 2020,
    citation: bilingual(
      "Une amélioration de 0,1 seconde de la vitesse mobile a été associée à une hausse de 9,2 % du panier moyen dans le commerce de détail (Deloitte & Google, Milliseconds Make Millions, 2020).",
      'A 0.1-second improvement in mobile site speed was associated with a +9.2% increase in average order value for retail (Deloitte & Google, Milliseconds Make Millions, 2020).',
    ),
    ratio: { kind: 'aov-uplift-per-0.1s', value: 0.092 },
  },
  {
    id: 'baymard-cart-abandonment-2025',
    category: ['accessibility', 'seo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Baymard Institute',
    year: 2025,
    citation: bilingual(
      "Le taux moyen documenté d'abandon de panier en ligne est de 70,22 %, d'après une méta-analyse de 50 études menées entre 2006 et 2025 (Baymard Institute, dernière mise à jour septembre 2025).",
      'The current documented average online cart-abandonment rate is 70.22%, a meta-analysis of 50 studies from 2006 to 2025 (Baymard Institute, last updated September 2025).',
    ),
    ratio: { kind: 'cart-abandonment-rate', value: 0.7022 },
  },
  {
    id: 'baymard-checkout-uplift-2025',
    category: ['accessibility', 'seo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Baymard Institute',
    year: 2025,
    citation: bilingual(
      "Une conception optimisée du tunnel de paiement peut augmenter les conversions jusqu'à 35,26 % sur un site e-commerce de grande taille moyen (Baymard Institute, 2025).",
      'Best-practice checkout design can lift conversions by up to 35.26% on the average large e-commerce site (Baymard Institute, 2025).',
    ),
    ratio: { kind: 'checkout-uplift', value: 0.3526 },
  },
  // item 1.5: the Legal & General (UK insurance) W3C case study was
  // removed here 2026-08-18. It carried no year (the underlying case study
  // is from the early 2000s), and StatSector has no way to mark a citation
  // "wrong sector, never generalize" - `sector: 'general'` means "applies
  // to every vertical" by definition, so a French hotel client received a
  // UK-insurance, GBP-denominated case study as its accessibility-to-
  // conversion evidence. No sector-matched hospitality replacement exists;
  // selectReferenceStats already returns no citation for an unmatched
  // sector/category pair rather than erroring, which is the correct
  // behaviour here (report, don't fabricate a comparison).
  {
    id: 'pew-ai-overviews-ctr-2025',
    category: ['seo', 'geo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Pew Research Center',
    year: 2025,
    citation: bilingual(
      "Les utilisateurs de Google ayant vu un résumé généré par IA ont cliqué sur un résultat de recherche traditionnel dans 8 % des visites, contre près de deux fois plus souvent (15 %) pour ceux qui n'en ont pas vu (Pew Research Center, juillet 2025, sur la base de 68 879 recherches Google effectuées par 900 adultes américains).",
      'Google users who encountered an AI summary clicked a traditional search result link in 8% of visits, versus nearly twice as often (15%) for those who did not (Pew Research Center, July 2025, based on 68,879 Google searches by 900 US adults).',
    ),
    ratio: { kind: 'ctr-with-ai-summary', value: 0.08 },
  },
  {
    id: 'pew-ai-overviews-zero-click-2025',
    category: ['seo', 'geo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'context-only',
    source: 'Pew Research Center',
    year: 2025,
    citation: bilingual(
      "La part des sessions se terminant sans aucun clic (« zero-click ») est passée à 26 % lorsqu'un résumé IA apparaissait, contre 16 % en son absence (Pew Research Center, juillet 2025).",
      "Sessions ending without any click ('zero-click') rose to 26% when an AI summary appeared, versus 16% when it did not (Pew Research Center, July 2025).",
    ),
  },
  {
    id: 'nestle-rich-results-ctr',
    category: ['seo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'context-only',
    source: 'Google (Nestlé case study)',
    citation: bilingual(
      "Les pages Nestlé affichées en résultat enrichi Google ont enregistré un taux de clic supérieur de 82 % à celui des pages non enrichies (étude de cas documentée par Google).",
      'Nestlé pages shown as Google rich results had an 82% higher click-through rate than non-rich pages (Google-documented case study).',
    ),
  },
  {
    id: 'rotten-tomatoes-rich-results-ctr',
    category: ['seo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'context-only',
    source: 'Google (Rotten Tomatoes case study)',
    citation: bilingual(
      "Les pages Rotten Tomatoes intégrant des données structurées ont enregistré un taux de clic supérieur de 25 % (étude de cas documentée par Google).",
      'Rotten Tomatoes pages with structured data saw a 25% higher click-through rate (Google-documented case study).',
    ),
  },
  {
    id: 'princeton-geo-visibility-2024',
    category: ['geo'],
    sector: 'general',
    confidence: 'emerging',
    scalability: 'scales-down',
    source: 'Aggarwal et al., GEO: Generative Engine Optimization, ACM KDD',
    year: 2024,
    citation: bilingual(
      "Dans un test contrôlé portant sur environ 10 000 requêtes réparties sur 9 domaines, des optimisations de contenu ciblées ont augmenté la visibilité dans les réponses des moteurs génératifs jusqu'à 40 % ; cette mesure porte sur la visibilité de citation au sein du test, non sur le trafic ou le chiffre d'affaires (Aggarwal et al., GEO: Generative Engine Optimization, ACM KDD 2024).",
      "In a controlled benchmark of about 10,000 queries across 9 domains, targeted content optimizations boosted visibility in generative-engine responses by up to 40%; this measures citation visibility within the benchmark, not traffic or revenue (Aggarwal et al., GEO: Generative Engine Optimization, ACM KDD 2024).",
    ),
    ratio: { kind: 'visibility-uplift', value: 0.4 },
  },
  {
    id: 'phocuswright-ai-trip-planning-2026',
    category: ['geo'],
    sector: 'hospitality',
    confidence: 'emerging',
    scalability: 'context-only',
    source: 'Phocuswright, The AI Surge',
    year: 2026,
    citation: bilingual(
      "56 % des voyageurs ont utilisé l'IA pour planifier, réserver ou obtenir une assistance sur place au cours des 12 derniers mois, contre 43 % au second semestre 2025 et 33 % au premier semestre 2025 (Phocuswright, The AI Surge, 2026).",
      '56% of travelers used AI for planning, booking, or in-destination assistance in the past 12 months, up from 43% in H2 2025 and 33% in H1 2025 (Phocuswright, The AI Surge, 2026).',
    ),
  },
];
