/**
 * Severity roll-up counts, read directly off the `findings` collection's
 * existing {auditId, severity} index (finding.schema.ts) - no new
 * modeling. Used by the interface's completion screen and history log,
 * neither of which need the full findings list, only the counts.
 */

import type { Connection } from 'mongoose';
import type { Severity } from '@odysseus/core';
import { createFindingModel } from './schemas/finding.schema.js';

export type SeverityRollup = Record<Severity, number>;

function emptyRollup(): SeverityRollup {
  return { critical: 0, serious: 0, moderate: 0, minor: 0 };
}

interface SeverityCountRow {
  _id: { auditId: string; severity: Severity };
  count: number;
}

export async function getSeverityRollup(connection: Connection, auditId: string): Promise<SeverityRollup> {
  const rollups = await getSeverityRollups(connection, [auditId]);
  return rollups.get(auditId) ?? emptyRollup();
}

/** One $group query for every auditId requested, rather than one query
 *  per row - the history log page renders many rows at once and must not
 *  turn into an N+1 query per row. */
export async function getSeverityRollups(
  connection: Connection,
  auditIds: readonly string[],
): Promise<Map<string, SeverityRollup>> {
  const result = new Map<string, SeverityRollup>();
  if (auditIds.length === 0) return result;

  const FindingModel = createFindingModel(connection);
  const rows = await FindingModel.aggregate<SeverityCountRow>([
    { $match: { auditId: { $in: [...auditIds] } } },
    { $group: { _id: { auditId: '$auditId', severity: '$severity' }, count: { $sum: 1 } } },
  ]);

  for (const auditId of auditIds) result.set(auditId, emptyRollup());
  for (const row of rows) {
    const rollup = result.get(row._id.auditId);
    if (rollup) rollup[row._id.severity] = row.count;
  }
  return result;
}
