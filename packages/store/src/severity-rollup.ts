/**
 * Severity roll-up counts for the Audits list (issue #508). The counts are
 * the report's primary population (@odysseus/report's primarySeverityRollup),
 * the same numbers the audit page shows, not a raw count of every finding.
 * persistAudit stores them on the audit with the findings, so the 5-second
 * list poll reads one small field per audit. Audits persisted before the
 * field existed fall back to the population inputs below, and the caller
 * stores what it computes so the fallback runs once per audit.
 */

import type { Connection } from 'mongoose';
import type { Finding, ManifestPageEntry, Severity } from '@odysseus/core';
import { createAuditModel, type StoredPrimarySeverityRollup } from './schemas/audit.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';

export type SeverityRollup = Record<Severity, number>;

interface StoredRollupRow {
  auditId: string;
  findingsProvenance?: { findingsDigest?: string };
  primarySeverityRollup?: StoredPrimarySeverityRollup;
}

/** The stored rollups that still describe each audit's current findings;
 *  an audit whose rollup is absent or keyed to another digest is left out. */
export async function getStoredPrimarySeverityRollups(
  connection: Connection,
  auditIds: readonly string[],
): Promise<Map<string, SeverityRollup>> {
  const result = new Map<string, SeverityRollup>();
  if (auditIds.length === 0) return result;
  const rows = await createAuditModel(connection)
    .find({ auditId: { $in: [...auditIds] } })
    .select({
      _id: 0,
      auditId: 1,
      'findingsProvenance.findingsDigest': 1,
      primarySeverityRollup: 1,
    })
    .lean<StoredRollupRow[]>();
  for (const row of rows) {
    const stored = row.primarySeverityRollup;
    const digest = row.findingsProvenance?.findingsDigest;
    if (stored === undefined || digest === undefined || stored.findingsDigest !== digest) continue;
    result.set(row.auditId, {
      critical: stored.critical,
      serious: stored.serious,
      moderate: stored.moderate,
      minor: stored.minor,
    });
  }
  return result;
}

/** What the primary population of one audit is computed from. The findings
 *  carry only the fields the population reads: elements hold their
 *  selectors alone, and pages their URL, status and discovery method. */
export interface SeverityPopulationInput {
  auditId: string;
  findingsDigest?: string;
  pages: ManifestPageEntry[];
  findings: Pick<Finding, 'severity' | 'pageUrls' | 'elements'>[];
}

export async function loadSeverityPopulationInputs(
  connection: Connection,
  auditIds: readonly string[],
): Promise<SeverityPopulationInput[]> {
  if (auditIds.length === 0) return [];
  const [audits, findings] = await Promise.all([
    createAuditModel(connection)
      .find({ auditId: { $in: [...auditIds] } })
      .select({
        _id: 0,
        auditId: 1,
        'findingsProvenance.findingsDigest': 1,
        'pages.url': 1,
        'pages.status': 1,
        'pages.discoveryMethod': 1,
      })
      .lean<
        {
          auditId: string;
          findingsProvenance?: { findingsDigest?: string };
          pages?: ManifestPageEntry[];
        }[]
      >(),
    createFindingModel(connection)
      .find({ auditId: { $in: [...auditIds] } })
      .select({ _id: 0, auditId: 1, severity: 1, pageUrls: 1, 'elements.selector': 1 })
      .lean<(Pick<Finding, 'severity' | 'pageUrls' | 'elements'> & { auditId: string })[]>(),
  ]);
  const audit = new Map(audits.map((row) => [row.auditId, row]));
  return [...new Set(auditIds)].map((auditId) => {
    const digest = audit.get(auditId)?.findingsProvenance?.findingsDigest;
    return {
      auditId,
      ...(digest !== undefined ? { findingsDigest: digest } : {}),
      pages: audit.get(auditId)?.pages ?? [],
      findings: findings
        .filter((finding) => finding.auditId === auditId)
        .map(({ severity, pageUrls, elements }) => ({ severity, pageUrls, elements })),
    };
  });
}

/**
 * Stores a rollup computed by the fallback. Only when the audit still has
 * that digest and no rollup of its own: persistAudit writes the digest and
 * its rollup in one update, so a fallback that read findings mid-persist
 * can never overwrite the rollup persistAudit wrote.
 */
export async function storePrimarySeverityRollup(
  connection: Connection,
  auditId: string,
  findingsDigest: string,
  rollup: SeverityRollup,
): Promise<void> {
  await createAuditModel(connection).updateOne(
    {
      auditId,
      'findingsProvenance.findingsDigest': findingsDigest,
      primarySeverityRollup: { $exists: false },
    },
    { $set: { primarySeverityRollup: { ...rollup, findingsDigest } } },
  );
}
