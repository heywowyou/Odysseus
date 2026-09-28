/**
 * Issue #538 (trade-off 125): the public bot and prospecting-privacy pages
 * promise that prospecting data, screenshots included, is deleted
 * automatically after 90 days. This is that deletion.
 *
 * A prospect expires when nothing has happened to it for 90 days: no scan,
 * no outreach touch, no reply, no operator edit (`listProspectExpiryRows`).
 * It is then deleted as the dashboard's delete action deletes it, audits and
 * their files included. Suppression entries are hashes in their own
 * collection and outlive it, as an objection must.
 *
 * A prospect that became a client, or is in a live commercial exchange, is
 * not prospecting data any more and never expires here: `won`, `call` and
 * `quoted`, and any prospect owning an audit retention counts as delivered.
 *
 * Like the audit retention run, a run that would delete more than the cap
 * refuses as a whole unless the operator lifts it from the CLI after a dry
 * run, so enabling the rule on a backlog is a deliberate act.
 */

import type { Connection } from 'mongoose';
import type { ProspectStatus } from '@odysseus/core';
import {
  listProspectExpiryRows,
  loadRetentionSnapshot,
  type ProspectExpiryRow,
} from '@odysseus/store';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { deleteProspectWithStorage } from '../artifacts/delete-prospect-with-storage.js';
import type { MailboxDraftAdapter } from '../outreach/mailbox-draft-adapter.js';
import type { PreviewPublisher } from '../outreach/preview-publisher.js';
import { RETENTION_RUN_CAP } from './apply-retention.js';
import { isDeliveredAudit } from './retention-policy.js';

export const PROSPECT_EXPIRY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const CLIENT_STATUSES: readonly ProspectStatus[] = ['won', 'call', 'quoted'];

export type ProspectExpiryKeepReason = 'client-status' | 'delivered-audit';

export interface ProspectExpiryPlan {
  expire: ProspectExpiryRow[];
  kept: { prospectId: string; reason: ProspectExpiryKeepReason }[];
}

/** Pure: which inactive prospects expire, and which are kept and why. */
export function planProspectExpiry(
  prospects: readonly ProspectExpiryRow[],
  deliveredProspectIds: ReadonlySet<string>,
  now: Date,
): ProspectExpiryPlan {
  const boundary = now.getTime() - PROSPECT_EXPIRY_DAYS * DAY_MS;
  const plan: ProspectExpiryPlan = { expire: [], kept: [] };
  for (const prospect of prospects) {
    if (prospect.lastActivityAt.getTime() >= boundary) continue;
    if (CLIENT_STATUSES.includes(prospect.status)) {
      plan.kept.push({ prospectId: prospect.prospectId, reason: 'client-status' });
    } else if (deliveredProspectIds.has(prospect.prospectId)) {
      plan.kept.push({ prospectId: prospect.prospectId, reason: 'delivered-audit' });
    } else {
      plan.expire.push(prospect);
    }
  }
  return plan;
}

export interface ProspectExpiryRunOptions {
  connection: Connection;
  artifactsRoot: string;
  store: ArtifactStore | undefined;
  publisher: () => PreviewPublisher;
  mailbox: MailboxDraftAdapter | null;
  now: Date;
  apply: boolean;
  /** Lifts the per-run cap. The scheduled sweeper never passes it. */
  allowLarge: boolean;
  /** A prospect whose work this process is still running is left for the
   *  next run. */
  isWorkInFlight?: (prospectId: string) => boolean | Promise<boolean>;
}

export interface ProspectExpiryRunResult {
  plan: ProspectExpiryPlan;
  deleted: string[];
  skipped: { prospectId: string; reason: string }[];
  refusal?: { reason: 'cap'; count: number; cap: number };
}

export async function runProspectExpiry(
  options: ProspectExpiryRunOptions,
): Promise<ProspectExpiryRunResult> {
  const [rows, snapshot] = await Promise.all([
    listProspectExpiryRows(options.connection),
    loadRetentionSnapshot(options.connection, options.now),
  ]);
  const delivered = new Set(
    snapshot.audits
      .filter(
        (audit) => audit.prospectId !== undefined && isDeliveredAudit(audit.auditId, snapshot),
      )
      .map((audit) => audit.prospectId!),
  );
  const plan = planProspectExpiry(rows, delivered, options.now);
  const result: ProspectExpiryRunResult = { plan, deleted: [], skipped: [] };
  if (!options.apply) return result;
  if (plan.expire.length > RETENTION_RUN_CAP && !options.allowLarge) {
    result.refusal = { reason: 'cap', count: plan.expire.length, cap: RETENTION_RUN_CAP };
    return result;
  }
  for (const prospect of plan.expire) {
    if (await options.isWorkInFlight?.(prospect.prospectId)) {
      result.skipped.push({ prospectId: prospect.prospectId, reason: 'work in flight' });
      continue;
    }
    const outcome = await deleteProspectWithStorage(options.connection, prospect.prospectId, {
      artifactsRoot: options.artifactsRoot,
      store: options.store,
      publisher: options.publisher,
      mailbox: options.mailbox,
    });
    if ('deleted' in outcome) result.deleted.push(prospect.prospectId);
    else result.skipped.push({ prospectId: prospect.prospectId, reason: outcome.detail });
  }
  return result;
}
