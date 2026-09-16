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
 * docs/rules/llm-layer-rules.md section 11's "No statistics" rule for outreach
 *
 * 2026-08-22: the hospitality-tagged rows below `phocuswright-ai-trip-
 * planning-2026` come from a second, sector-targeted research pass,
 * `docs/research/sector-reference-stats/hospitality.md` (see that file's
 * own promotion table for what was and wasn't wired in, and why).
 * `docs/research/sector-reference-stats/README.md` is the template for
 * adding more sectors the same way. That research pass confirmed, after
 * checking six countries, that no study anywhere ties a WCAG fix to a
 * measured booking-conversion delta for a hotel or restaurant - every
 * new hospitality accessibility row below is therefore `context-only`,
 * never `scales-down`. Do not add a scalable accessibility ratio for
 * hospitality without a real source; the honest gap is documented, not
 * a placeholder waiting to be filled in.
 * is deliberately stricter than the paid report path.
 */

import type { ReferenceStat, StatScope } from './types.js';

function bilingual(fr: string, en: string): { fr: string; en: string } {
  return { fr, en };
}

/** Issue #298: the rule ids a statistic about page loading speed can
 *  speak to - everything a report can tell a client to change that makes
 *  the page appear sooner. Named once so the three Deloitte rows cannot
 *  drift apart from each other. */
const LOADING_SPEED_RULES: readonly string[] = [
  'bf-cache',
  'bootup-time',
  'cache-insight',
  'crux-lcp-poor',
  'document-latency-insight',
  'dom-size',
  'dom-size-insight',
  'duplicated-javascript-insight',
  'first-contentful-paint',
  'font-display',
  'font-display-insight',
  'forced-reflow-insight',
  'image-delivery-insight',
  'image-legacy-format',
  'image-oversized',
  'largest-contentful-paint',
  'largest-contentful-paint-element',
  'lcp-breakdown-insight',
  'lcp-discovery-insight',
  'lcp-lazy-loaded',
  'legacy-javascript',
  'legacy-javascript-insight',
  'long-tasks',
  'mainthread-work-breakdown',
  'max-potential-fid',
  'modern-http-insight',
  'modern-image-formats',
  'network-dependency-tree-insight',
  'offscreen-images',
  'prioritize-lcp-image',
  'redirect-chain-excessive',
  'render-blocking-insight',
  'render-blocking-resources',
  'server-response-time',
  'speed-index',
  'third-parties-insight',
  'third-party-facades',
  'third-party-summary',
  'total-blocking-time',
  'total-byte-weight',
  'unminified-css',
  'unminified-javascript',
  'unsized-images',
  'unused-css-rules',
  'unused-javascript',
  'uses-http2',
  'uses-long-cache-ttl',
  'uses-optimized-images',
  'uses-rel-preconnect',
  'uses-responsive-images',
  'uses-text-compression',
];

/** Issue #298: defects that stop a visitor completing a booking or a
 *  purchase - the only kind a cart-abandonment or checkout-design figure
 *  can speak to. Deliberately not every accessibility rule: a missing
 *  image alternative is a real failure, and it is not what an abandoned
 *  checkout measures. The transactional-page gate in themes.ts still
 *  applies on top, so these also have to be observed on a page the scan
 *  found a real transactional flow on. */
const BOOKING_JOURNEY_RULES: readonly string[] = [
  'aria-command-name',
  'aria-input-field-name',
  'aria-required-attr',
  'aria-required-children',
  'aria-required-parent',
  'aria-toggle-field-name',
  'autocomplete-valid',
  'button-name',
  'focus-order-mismatch',
  'form-error-not-associated',
  'form-field-multiple-labels',
  'input-button-name',
  'keyboard-trap',
  'label-content-name-mismatch',
  'nested-interactive',
  'select-name',
  'target-size',
];

/** Issue #298: how a page competes for a click in a results page - its
 *  title and description snippet, and whether it can be indexed at all.
 *  Carried over from item 1.1's original rule list on the two Pew
 *  rows. */
const SERP_APPEARANCE_RULES: readonly string[] = [
  'canonical-conflicting',
  'is-crawlable',
  'jsonld-invalid',
  'jsonld-missing',
  'meta-description',
  'meta-description-length',
  'meta-description-missing',
  'meta-title-length',
  'meta-title-missing',
  'noindex-on-public-page',
];

/** Issue #298: rich-result eligibility. A click-through case study about
 *  structured data cannot speak to a broken internal link or a missing
 *  canonical, which is what a real Villas Foch priority cited it on. */
const RICH_RESULT_RULES: readonly string[] = [
  'entity-data-incomplete',
  'faq-content-without-schema',
  'jsonld-invalid',
  'jsonld-missing',
  'structured-data',
  'structured-data-entity-missing',
  'structured-data-invalid',
];

const CATEGORY_WIDE: StatScope = { kind: 'category' };

export const REFERENCE_STAT_TABLE: readonly ReferenceStat[] = [
  {
    id: 'deloitte-speed-conversion-retail-2020',
    scope: { kind: 'rules', ruleIds: LOADING_SPEED_RULES },
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
    scope: { kind: 'rules', ruleIds: LOADING_SPEED_RULES },
    // B1: same retag as deloitte-speed-conversion-retail-2020 above.
    category: ['performance'],
    sector: 'hospitality',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Deloitte & Google, Milliseconds Make Millions',
    year: 2020,
    citation: bilingual(
      'Une amélioration de 0,1 seconde de la vitesse mobile a été associée à une hausse de 10,1 % des conversions dans le secteur du voyage (Deloitte & Google, Milliseconds Make Millions, 2020).',
      'A 0.1-second improvement in mobile site speed was associated with a +10.1% increase in travel-sector conversions (Deloitte & Google, Milliseconds Make Millions, 2020).',
    ),
    ratio: { kind: 'conversion-uplift-per-0.1s', value: 0.101 },
  },
  {
    id: 'deloitte-aov-retail-2020',
    scope: { kind: 'rules', ruleIds: LOADING_SPEED_RULES },
    // B1: same retag as deloitte-speed-conversion-retail-2020 above.
    category: ['performance'],
    sector: 'general',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Deloitte & Google, Milliseconds Make Millions',
    year: 2020,
    citation: bilingual(
      'Une amélioration de 0,1 seconde de la vitesse mobile a été associée à une hausse de 9,2 % du panier moyen dans le commerce de détail (Deloitte & Google, Milliseconds Make Millions, 2020).',
      'A 0.1-second improvement in mobile site speed was associated with a +9.2% increase in average order value for retail (Deloitte & Google, Milliseconds Make Millions, 2020).',
    ),
    ratio: { kind: 'aov-uplift-per-0.1s', value: 0.092 },
  },
  {
    id: 'baymard-cart-abandonment-2025',
    scope: { kind: 'rules', ruleIds: BOOKING_JOURNEY_RULES },
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
    scope: { kind: 'rules', ruleIds: BOOKING_JOURNEY_RULES },
    category: ['accessibility', 'seo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'scales-down',
    source: 'Baymard Institute',
    year: 2025,
    citation: bilingual(
      'Une conception optimisée du tunnel de paiement peut augmenter les conversions de 35,26 % en moyenne sur les sites e-commerce de grande taille (Baymard Institute, 2025).',
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
    scope: { kind: 'rules', ruleIds: SERP_APPEARANCE_RULES },
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
    scope: { kind: 'rules', ruleIds: SERP_APPEARANCE_RULES },
    category: ['seo', 'geo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'context-only',
    source: 'Pew Research Center',
    year: 2025,
    citation: bilingual(
      "La part des sessions se terminant sans aucun clic (« zero-click ») est passée à 26 % lorsqu'un résumé IA apparaissait, contre 16 % en son absence (Pew Research Center, juillet 2025).",
      "Sessions ending without any click ('zero-click') rose to 26% when an AI summary appeared, versus 16% when it did not (Pew Research Center, July 2025).",
    ),
  },
  {
    id: 'nestle-rich-results-ctr',
    scope: { kind: 'rules', ruleIds: RICH_RESULT_RULES },
    category: ['seo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'context-only',
    source: 'Google (Nestlé case study)',
    citation: bilingual(
      'Les pages Nestlé affichées en résultat enrichi Google ont enregistré un taux de clic supérieur de 82 % à celui des pages non enrichies (étude de cas documentée par Google).',
      'Nestlé pages shown as Google rich results had an 82% higher click-through rate than non-rich pages (Google-documented case study).',
    ),
  },
  {
    id: 'rotten-tomatoes-rich-results-ctr',
    scope: { kind: 'rules', ruleIds: RICH_RESULT_RULES },
    category: ['seo'],
    sector: 'general',
    confidence: 'established',
    scalability: 'context-only',
    source: 'Google (Rotten Tomatoes case study)',
    citation: bilingual(
      'Les pages Rotten Tomatoes intégrant des données structurées ont enregistré un taux de clic supérieur de 25 % (étude de cas documentée par Google).',
      'Rotten Tomatoes pages with structured data saw a 25% higher click-through rate (Google-documented case study).',
    ),
  },
  {
    id: 'princeton-geo-visibility-2024',
    scope: CATEGORY_WIDE,
    category: ['geo'],
    sector: 'general',
    confidence: 'emerging',
    scalability: 'scales-down',
    source: 'Aggarwal et al., GEO: Generative Engine Optimization, ACM KDD',
    year: 2024,
    citation: bilingual(
      "Dans un test contrôlé portant sur environ 10 000 requêtes réparties sur 9 domaines, des optimisations de contenu ciblées ont augmenté la visibilité dans les réponses des moteurs génératifs jusqu'à 40 % ; cette mesure porte sur la visibilité de citation au sein du test, non sur le trafic ou le chiffre d'affaires (Aggarwal et al., GEO: Generative Engine Optimization, ACM KDD 2024).",
      'In a controlled benchmark of about 10,000 queries across 9 domains, targeted content optimizations boosted visibility in generative-engine responses by up to 40%; this measures citation visibility within the benchmark, not traffic or revenue (Aggarwal et al., GEO: Generative Engine Optimization, ACM KDD 2024).',
    ),
    ratio: { kind: 'visibility-uplift', value: 0.4 },
  },
  {
    id: 'phocuswright-ai-trip-planning-2026',
    scope: CATEGORY_WIDE,
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
  // 2026-08-22 sector research pass, hospitality.md entry 1. Self-selected
  // survey sample (MEDIUM credibility in the source doc) -> 'emerging',
  // not 'established'.
  {
    id: 'accessable-avoidance-2023',
    scope: CATEGORY_WIDE,
    category: ['accessibility'],
    sector: 'hospitality',
    confidence: 'emerging',
    scalability: 'context-only',
    source: 'AccessAble, Accessibility and You Survey 2023/24',
    year: 2024,
    citation: bilingual(
      "77 % des personnes en situation de handicap déclarent avoir déjà évité un établissement faute d'y trouver l'information d'accessibilité recherchée, et 87 % attendent que cette information figure directement sur le site de l'établissement plutôt que sur une plateforme tierce (AccessAble, Accessibility and You Survey 2023/24, enquête en ligne auprès de sa communauté d'utilisateurs en situation de handicap, échantillon non représentatif, repris comme source de référence par VisitEngland).",
      "77% of disabled respondents report having avoided a venue because they could not find the accessibility information they were looking for, and 87% expect that information to appear directly on the venue's own website rather than on a third-party platform (AccessAble, Accessibility and You Survey 2023/24, an online survey of its own disabled user community, non-representative sample, used as a reference source by VisitEngland).",
    ),
  },
  // hospitality.md entry 3. National statistics, disclosed comparison
  // group -> 'established' despite being a UK rather than French source;
  // no comparable French hospitality-specific figure exists (see
  // hospitality.md entry 6 for why DREES's figure was not used instead).
  {
    id: 'dcms-holiday-participation-gap-2024',
    scope: CATEGORY_WIDE,
    category: ['accessibility'],
    sector: 'hospitality',
    confidence: 'established',
    scalability: 'context-only',
    source: 'UK Department for Culture, Media and Sport, Participation Survey 2024/25',
    year: 2024,
    citation: bilingual(
      "45 % des adultes en situation de handicap en Angleterre n'ont pris aucune nuitée touristique au cours des 12 derniers mois, contre 34 % des adultes sans situation de handicap (UK Department for Culture, Media and Sport, Participation Survey 2024/25, statistiques nationales).",
      '45% of disabled adults in England took no overnight domestic holiday in the past 12 months, versus 34% of non-disabled adults (UK Department for Culture, Media and Sport, Participation Survey 2024/25, national statistics).',
    ),
  },
  // hospitality.md entry 5. French, exact client segment (5th-category
  // hotels/restaurants). Sample size undisclosed in the volume reviewed
  // -> 'emerging'. The secondhand TRAVELSAT 78%/67% figure from the same
  // source document was deliberately dropped, not encoded here.
  {
    id: 'dge-accesmetrie-booking-rare-2019',
    scope: CATEGORY_WIDE,
    category: ['accessibility'],
    sector: 'hospitality',
    confidence: 'emerging',
    scalability: 'context-only',
    source:
      'DGE / Accesmetrie, Retombées économiques de la mise aux normes accessibilité des ERP de 5e catégorie',
    year: 2019,
    citation: bilingual(
      "La possibilité de réserver une chambre adaptée directement sur le site de l'hôtel reste rare, la gestion du site étant le plus souvent confiée à un tiers (DGE / Accesmetrie, étude commandée par la Direction générale des entreprises, 2019, portant spécifiquement sur les hôtels et restaurants de 5e catégorie).",
      "The ability to book an adapted room directly on the hotel's own website remains rare, since the site is usually operated by a third party (DGE / Accesmetrie, a study commissioned by the French Direction générale des entreprises, 2019, scoped specifically to 5th-category hotels and restaurants).",
    ),
  },
  // hospitality.md entry 8. Peer-reviewed, disclosed sample/tools, EU
  // hotel population -> 'established'.
  {
    id: 'teixeira-hotel-accessibility-portugal-2022',
    scope: CATEGORY_WIDE,
    category: ['accessibility'],
    sector: 'hospitality',
    confidence: 'established',
    scalability: 'context-only',
    source: 'Teixeira, Eusébio and Teixeira, Tourism and Hospitality Research',
    year: 2022,
    citation: bilingual(
      "Une étude portant sur 306 sites d'hôtels et de Pousadas de la région centrale du Portugal a mesuré un niveau d'accessibilité web globalement faible au regard des WCAG 2.0, les hôtels les plus haut de gamme obtenant, contre toute attente, les moins bons résultats (Teixeira, Eusébio et Teixeira, Tourism and Hospitality Research, étude évaluée par les pairs, 2022).",
      'A study of 306 hotel and Pousada websites in central Portugal measured broadly low web accessibility against WCAG 2.0, with higher-category hotels scoring worse than expected (Teixeira, Eusébio and Teixeira, Tourism and Hospitality Research, peer-reviewed, 2022).',
    ),
  },
  // hospitality.md entry 9. Peer-reviewed venue, but single automated
  // tool and an undefined sample frame -> 'emerging', corroborating
  // teixeira-hotel-accessibility-portugal-2022 above rather than
  // standing alone.
  {
    id: 'singh-hotel-accessibility-top100-2025',
    scope: CATEGORY_WIDE,
    category: ['accessibility'],
    sector: 'hospitality',
    confidence: 'emerging',
    scalability: 'context-only',
    source: 'Singh, Sibi and Bashir, Tourism and Hospitality Research',
    year: 2025,
    citation: bilingual(
      "Une évaluation des 100 principaux sites d'hôtels selon les WCAG 2.0 niveau AA a mis en évidence des obstacles récurrents concernant les alternatives textuelles, la navigation et la compatibilité avec les technologies d'assistance (Singh, Sibi et Bashir, Tourism and Hospitality Research, étude évaluée par les pairs, 2025).",
      'An evaluation of the top 100 hotel websites against WCAG 2.0 level AA found recurring barriers around text alternatives, navigability, and assistive-technology compatibility (Singh, Sibi and Bashir, Tourism and Hospitality Research, peer-reviewed, 2025).',
    ),
  },
  // hospitality.md's "confirmed no citable data" section: the only
  // hospitality booking-abandonment figure anywhere with disclosed
  // methodology, explicitly self-reported recall rather than a measured
  // funnel rate - stated as such in the citation text itself, tagged
  // 'performance' rather than 'accessibility' since it is not tied to any
  // specific defect type.
  {
    id: 'siteminder-digital-experience-abandonment-2025',
    scope: CATEGORY_WIDE,
    category: ['performance'],
    sector: 'hospitality',
    confidence: 'established',
    scalability: 'context-only',
    source: 'SiteMinder, Changing Traveller Report 2025',
    year: 2025,
    citation: bilingual(
      "52 % des voyageurs déclarent avoir déjà abandonné une réservation en raison d'une mauvaise expérience numérique, d'après une enquête déclarative menée auprès de plus de 12 000 répondants dans 14 pays (SiteMinder, Changing Traveller Report, 2025). Il s'agit d'un souvenir déclaré, non d'un taux d'abandon mesuré sur un tunnel de réservation réel.",
      '52% of travelers report having abandoned a booking due to a bad digital experience, based on a self-reported survey of over 12,000 respondents across 14 countries (SiteMinder, Changing Traveller Report, 2025). This is self-reported recall, not a measured booking-funnel abandonment rate.',
    ),
  },
];
