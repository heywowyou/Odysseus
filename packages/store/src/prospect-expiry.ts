import type { ProspectStatus } from '@odysseus/core';
import type { Connection } from 'mongoose';
import { createAuditModel } from './schemas/audit.schema.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';

/** What the 90-day prospect expiry (issue #538) needs to know about one
 *  prospect: its status and the last time anything happened to it. */
export interface ProspectExpiryRow {
  prospectId: string;
  status: ProspectStatus;
  /** The latest of the record's own activity date, its newest event (a scan,
   *  an outreach touch, a reply, an operator edit) and its newest audit. */
  lastActivityAt: Date;
}

function latest(...dates: (Date | undefined)[]): Date {
  let newest = 0;
  for (const date of dates) {
    if (date !== undefined && date.getTime() > newest) newest = date.getTime();
  }
  return new Date(newest);
}

export async function listProspectExpiryRows(connection: Connection): Promise<ProspectExpiryRow[]> {
  const [prospects, events, audits] = await Promise.all([
    createProspectHubModel(connection)
      .find({})
      .select({ _id: 0, prospectId: 1, status: 1, lastActivityAt: 1, updatedAt: 1 })
      .lean<
        Array<{
          prospectId: string;
          status: ProspectStatus;
          lastActivityAt?: Date;
          updatedAt?: Date;
        }>
      >(),
    createProspectEventModel(connection).aggregate<{ _id: string; at: Date }>([
      { $group: { _id: '$prospectId', at: { $max: '$at' } } },
    ]),
    createAuditModel(connection).aggregate<{ _id: string; at: Date }>([
      { $match: { prospectId: { $type: 'string' } } },
      { $group: { _id: '$prospectId', at: { $max: '$startedAt' } } },
    ]),
  ]);
  const eventAt = new Map(events.map((row) => [row._id, row.at]));
  const auditAt = new Map(audits.map((row) => [row._id, row.at]));
  return prospects.map((prospect) => ({
    prospectId: prospect.prospectId,
    status: prospect.status,
    lastActivityAt: latest(
      prospect.lastActivityAt,
      prospect.updatedAt,
      eventAt.get(prospect.prospectId),
      auditAt.get(prospect.prospectId),
    ),
  }));
}
