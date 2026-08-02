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
export * from './normalize/severity.js';
export * from './normalize/constants.js';
export * from './normalize/wcag-tags.js';
export * from './normalize/dedupe.js';
export * from './normalize/finding-id.js';
export * from './normalize/candidate.js';
export * from './normalize/normalize-axe.js';
export * from './normalize/normalize-lighthouse.js';
export * from './normalize/normalize-renderdiff.js';
export * from './normalize/normalize.js';
