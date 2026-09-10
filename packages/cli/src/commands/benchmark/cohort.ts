/**
 * Milestone 10's frozen benchmark cohort, transcribed verbatim (order and
 * all) from docs/product/milestone-10-benchmark-permission-record.md
 * section 4. Cohort-specific data, not operator-editable config like
 * naf-sector-allowlist.json, so it lives as a literal array rather than a
 * JSON file: changing it is changing which permission record it
 * implements, not tuning a running system.
 *
 * The seven "(fr)" storefronts the permission record flags for host
 * pinning (temu.com, ikea.com, etsy.com, nespresso.com, adopt.com,
 * rituals.com, samsung.com) are listed here as their bare apex domain -
 * the qualify runner resolves and records the actual storefront host from
 * the homepage fetch's own redirect chain, per the operator's decision to
 * pin at fetch time rather than by hand in advance.
 *
 * Do not add, remove, or reorder an entry here without a corresponding
 * update to the permission record: this array *is* "the exact candidate
 * list" that record approves.
 */
export const BENCHMARK_COHORT_VERSION = 'milestone-10-2026-09';

export const BENCHMARK_COHORT_DOMAINS: readonly string[] = [
  'amazon.fr',
  'temu.com',
  'e.leclerc',
  'vinted.fr',
  'carrefour.fr',
  'lidl.fr',
  'cdiscount.com',
  'fr.aliexpress.com',
  'fnac.com',
  'shein.fr',
  'boulanger.com',
  'darty.com',
  'leroymerlin.fr',
  'veepee.fr',
  'intermarche.com',
  'fr.shopping.rakuten.com',
  'manomano.fr',
  'undiz.com',
  'damart.fr',
  'decathlon.fr',
  'ikea.com',
  'becquet.fr',
  'etsy.com',
  'nespresso.com',
  'picard.fr',
  'yvesrocher.fr',
  'adopt.com',
  'rituals.com',
  'dyson.fr',
  'bosch-home.fr',
  'samsung.com',
  'vertbaudet.fr',
  'cultura.com',
  'zalando.fr',
  'king-jouet.com',
  'intersport.fr',
  'nike.com',
  'sephora.fr',
  'nocibe.fr',
  'aroma-zone.com',
  'conforama.fr',
  'castorama.fr',
  'bricodepot.fr',
];
