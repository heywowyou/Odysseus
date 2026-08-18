/**
 * Public entry point for @odysseus/core.
 *
 * findings.ts, llm-output.ts, and normalize/severity.ts are locked
 * contracts. Everything else re-exported here is additive normalization
 * and manifest support added in Milestone 4, not a reshaping of what
 * already existed.
 */

export * from './types/findings.js';
export * from './types/llm-output.js';
export * from './types/manifest.js';
export * from './types/manual-fields.js';
export * from './types/entity.js';
export * from './types/compliance.js';
export * from './urls.js';
export * from './compliance/siren.js';
export * from './compliance/regimes.js';
export * from './compliance/assessObligations.js';
export * from './compliance/enforcement-facts.js';
export * from './reference-stats/types.js';
export * from './reference-stats/stats.js';
export * from './reference-stats/sector.js';
export * from './reference-stats/select.js';
export * from './reference-stats/calculator.js';
export * from './reference-stats/benchmarks.js';
export * from './reference-stats/recommendation-templates.js';
export * from './types/prospecting.js';
export * from './prospecting/qualify-prospect.js';
export * from './prospecting/effectif-threshold.js';
export * from './prospecting/naf-allowlist.js';
export * from './prospecting/free-mail-domains.js';
export * from './prospecting/role-address.js';
export * from './prospecting/suppression-hash.js';
export * from './normalize/severity.js';
export * from './normalize/constants.js';
export * from './normalize/cwv-thresholds.js';
export * from './normalize/wcag-tags.js';
export * from './normalize/dedupe.js';
export * from './normalize/finding-id.js';
export * from './normalize/candidate.js';
export * from './normalize/normalize-axe.js';
export * from './normalize/normalize-lighthouse.js';
export * from './normalize/normalize-renderdiff.js';
export * from './normalize/normalize-custom.js';
export * from './normalize/normalize.js';
export * from './normalize/heuristic-rules.js';
