/**
 * Aggregate views: whole-population summaries that are safe to render
 * anywhere because they carry vocabulary-keyed counts and grouped hosts,
 * never individual candidates.
 */

import type { Connection } from 'mongoose';
import { getPrescanVendorAggregate, type PrescanVendorAggregate } from '../prescans.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';

/** The vendor and failure fingerprint aggregate. Composed unchanged from
 *  getPrescanVendorAggregate, which already bounds itself by minimum group
 *  size so a fingerprint seen once (a fact about one identifiable business)
 *  never reaches an operator view. */
export async function getVendorFingerprintAggregate(
  connection: Connection,
  prescanVersion: string,
  minimumGroupSize = 5,
): Promise<PrescanVendorAggregate> {
  return getPrescanVendorAggregate(connection, prescanVersion, minimumGroupSize);
}

export interface OperatorOutcomeSummary {
  total: number;
  byOutcome: Record<string, number>;
  byLostReason: Record<string, number>;
}

/** Privacy-safe outcome counts. Vocabulary-keyed counts only: no candidate
 *  ids, no threads, no free text, so the summary can be rendered anywhere
 *  without a leak path. */
export async function getOutcomeSummary(connection: Connection): Promise<OperatorOutcomeSummary> {
  const [facets] = await createOutreachOutcomeModel(connection).aggregate<{
    byOutcome: Array<{ _id: string; count: number }>;
    byLostReason: Array<{ _id: string; count: number }>;
    total: Array<{ count: number }>;
  }>([
    {
      $facet: {
        byOutcome: [{ $group: { _id: '$outcome', count: { $sum: 1 } } }],
        byLostReason: [
          { $match: { lostReason: { $exists: true, $ne: null } } },
          { $group: { _id: '$lostReason', count: { $sum: 1 } } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const byOutcome: Record<string, number> = {};
  for (const row of facets?.byOutcome ?? []) byOutcome[row._id] = row.count;
  const byLostReason: Record<string, number> = {};
  for (const row of facets?.byLostReason ?? []) byLostReason[row._id] = row.count;
  return { total: facets?.total[0]?.count ?? 0, byOutcome, byLostReason };
}
