/**
 * Regression guard for issue #173: Mongoose v9 strict mode silently strips
 * undeclared top-level paths from persist-audit.ts's $set upsert, so any
 * AuditManifest key missing from auditSchema never reaches the audits
 * collection. This file needs no Mongo; it only diffs declared paths
 * against the interface's key set.
 */

import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { auditSchema } from './audit.schema.js';

// Enumerates every AuditManifest key at runtime. The satisfies clause makes
// the compiler reject this file if AuditManifest gains or loses a key, so
// this list cannot silently drift from the interface the way the schema
// itself drifted before issue #173.
const manifestKeys = {
  auditId: true,
  prospectId: true,
  scanIntent: true,
  kind: true,
  siteUrl: true,
  startedAt: true,
  finishedAt: true,
  renormalizedAt: true,
  findingsProvenance: true,
  tool: true,
  config: true,
  crawl: true,
  pushbackEvents: true,
  pacingRecoveryEvents: true,
  coverageLimitations: true,
  pages: true,
  continuationGuardSummary: true,
  relativeLinkNestingSummary: true,
  siteSignals: true,
  privacySecurityCoverage: true,
  cruxFieldData: true,
  translationClusters: true,
  benchmarkPercentile: true,
} satisfies Record<keyof AuditManifest, true>;

// DB-only enrichment fields declared on AuditDocumentFields, never part of
// manifest.json.
const documentOnlyKeys = [
  'manualFields',
  'reportPreparation',
  'gradeOverride',
  'blockedPagesAcknowledgment',
  'evidenceCoverage',
  'retention',
  'primarySeverityRollup',
] as const;

describe('auditSchema', () => {
  it('declares a path for every AuditManifest key plus the DB-only enrichment fields', () => {
    const declaredPaths = new Set(Object.keys(auditSchema.paths));
    // Auto-managed paths every Mongoose schema carries.
    declaredPaths.delete('_id');
    declaredPaths.delete('__v');

    const expectedPaths = new Set([...Object.keys(manifestKeys), ...documentOnlyKeys]);

    expect([...declaredPaths].sort()).toEqual([...expectedPaths].sort());
  });
});
