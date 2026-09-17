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
export * from './coverage-summary.js';
export * from './crawl-coverage-gate.js';
export * from './build-identity.js';
export * from './grade.js';
export * from './types/manual-fields.js';
export * from './types/entity.js';
export * from './types/compliance.js';
export * from './urls.js';
export * from './compliance/siren.js';
export * from './compliance/regimes.js';
export * from './compliance/assessObligations.js';
export * from './compliance/enforcement-facts.js';
export * from './compliance/registry-name.js';
export * from './compliance/outreach-facts-block.js';
export * from './offer/pricing.js';
export * from './types/outreach-preview.js';
export * from './types/hotel-prescan-evidence.js';
export * from './prospecting/hotel-writing-site-context.js';
export * from './normalize/translation-clusters.js';
export * from './normalize/findings-provenance.js';
export * from './normalize/normalize-cookie-consent.js';
export * from './normalize/normalize-accessibility-statement.js';
export * from './normalize/normalize-nap-consistency.js';
export * from './normalize/normalize-reflow.js';
export * from './normalize/normalize-html-validity.js';
export * from './reference-stats/types.js';
export * from './reference-stats/stats.js';
export * from './reference-stats/sector.js';
export * from './reference-stats/select.js';
export * from './reference-stats/calculator.js';
export * from './reference-stats/benchmarks.js';
export * from './reference-stats/recommendation-templates.js';
export * from './reference-stats/effort-estimate.js';
export * from './types/prospecting.js';
export * from './types/prospect.js';
export * from './types/pipeline-freshness.js';
export * from './types/hotel-catalogue.js';
export * from './prospecting/effectif-threshold.js';
export * from './prospecting/naf-allowlist.js';
export * from './prospecting/hotel-star-rating.js';
export * from './prospecting/hotel-vendor-hosts.js';
export * from './prospecting/hotel-domain.js';
export * from './prospecting/hotel-chain-portals.js';
export * from './prospecting/redirect-target.js';
export * from './prospecting/outreach-thread-state.js';
export * from './prospecting/outreach-outcome.js';
export * from './prospecting/classify-mailbox-thread.js';
export * from './prospecting/outreach-preview-summary.js';
export * from './prospecting/parked-page-signatures.js';
export * from './prospecting/overpass-decision.js';
export * from './cost-gating/brokenness.js';
export * from './benchmark/percentile.js';
export * from './delta/findings-delta.js';
export * from './benchmark/qualify-benchmark-candidate.js';
export * from './prospecting/contact-identity.js';
export * from './prospecting/free-mail-domains.js';
export * from './prospecting/discover-role-contact.js';
export * from './prospecting/role-address.js';
export * from './prospecting/suppression-hash.js';
export * from './prospecting/outreach-contact.js';
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
export * from './normalize/normalize-keyboard-navigation.js';
export * from './normalize/normalize-form-error-handling.js';
export * from './normalize/normalize-geo.js';
export * from './normalize/normalize-video-captions.js';
export * from './normalize/normalize-placeholder-labels.js';
export * from './normalize/normalize-alt-text.js';
export { languagePrefixOf } from './normalize/normalize-hreflang.js';

// Report preparation, plan 019: bounded personalization vocabularies,
// evidence-bound journeys, warning digest, and analysis-pair selection
// (trade-off 62).
export * from './report-preparation/vocabulary.js';
export * from './report-preparation/preparation.js';
export * from './report-preparation/warning-digest.js';
export * from './report-preparation/hook-family.js';
export * from './report-preparation/selection.js';
export * from './report-preparation/preview.js';

export * from './types/report-quality.js';
