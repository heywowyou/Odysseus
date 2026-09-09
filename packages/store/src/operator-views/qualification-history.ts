/**
 * Qualification history views: one candidate's qualification generations,
 * newest first, with reasons and the Sirene join's status but none of the
 * raw probe payload.
 */

import type { Connection } from 'mongoose';
import type { HotelQualificationOutcome, HotelQualificationReason } from '@odysseus/core';
import { createHotelQualificationModel } from '../schemas/hotel-qualification.schema.js';
import { pageBounds, type OperatorViewPage, type OperatorViewPageOptions } from './shared.js';

export interface OperatorQualificationEvent {
  qualificationId: string;
  qualificationVersion: string;
  domain: string | null;
  outcome: HotelQualificationOutcome;
  reasons: HotelQualificationReason[];
  notes: string[];
  /** The Sirene join's status and effectif band, which scoring reads. The
   *  rest of the join (denomination, NAF) stays out of the view. */
  sireneStatus: string | null;
  effectifBandCode: string | null;
  evaluatedAt: Date;
}

/** One candidate's qualification generations, newest first. `siteFacts` is
 *  deliberately not projected: it is the probe's raw payload, and the
 *  operator question this view answers is "what was concluded and why", not
 *  "what exactly did the fetch see". */
export async function getProspectQualificationHistory(
  connection: Connection,
  candidateId: string,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorQualificationEvent>> {
  const { limit, offset, skip } = pageBounds(options);
  const QualificationModel = createHotelQualificationModel(connection);
  const filter: Record<string, unknown> = { candidateId };
  const [total, rows] = await Promise.all([
    QualificationModel.countDocuments(filter),
    QualificationModel.find(filter)
      .sort({ evaluatedAt: -1, qualificationVersion: 1 })
      .skip(skip)
      .limit(limit)
      .select({
        qualificationId: 1,
        qualificationVersion: 1,
        domain: 1,
        outcome: 1,
        reasons: 1,
        notes: 1,
        'sireneJoin.status': 1,
        'sireneJoin.effectifBandCode': 1,
        evaluatedAt: 1,
        _id: 0,
      })
      .lean<
        {
          qualificationId: string;
          qualificationVersion: string;
          domain?: string | null;
          outcome: HotelQualificationOutcome;
          reasons: string[];
          notes: string[];
          sireneJoin?: { status?: unknown; effectifBandCode?: unknown };
          evaluatedAt: Date;
        }[]
      >(),
  ]);

  return {
    rows: rows.map((row) => ({
      qualificationId: row.qualificationId,
      qualificationVersion: row.qualificationVersion,
      domain: row.domain ?? null,
      outcome: row.outcome,
      reasons: row.reasons as HotelQualificationReason[],
      notes: [...row.notes],
      sireneStatus: typeof row.sireneJoin?.status === 'string' ? row.sireneJoin.status : null,
      effectifBandCode:
        typeof row.sireneJoin?.effectifBandCode === 'string'
          ? row.sireneJoin.effectifBandCode
          : null,
      evaluatedAt: row.evaluatedAt,
    })),
    total,
    limit,
    offset,
  };
}
