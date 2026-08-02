/**
 * Public entry point for @odysseus/core.
 *
 * Re-exports the locked contracts only. Anything added here later
 * (dedupe, crawler types, report types) should be additive, not a
 * reshaping of what already exists.
 */

export * from './types/findings.js';
export * from './types/llm-output.js';
export * from './normalize/severity.js';
