/**
 * Bumped whenever the report template's structure or content changes in a
 * way worth distinguishing in stored report metadata, the same reasoning
 * as FINDINGS_SCHEMA_VERSION: a template change between two monitoring
 * reports must never read as the client's site having changed.
 */
export const REPORT_TEMPLATE_VERSION = 1;
