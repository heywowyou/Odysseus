/**
 * Plan 077: retention slims a superseded, delivered audit by deleting its
 * raw scan evidence (`pages/**`, crawl state). Anything that recomputes from
 * that evidence (renormalizing, rewriting, re-rendering, a quality run)
 * would fail deep in the pipeline with a confusing file error, so each such
 * route asks here first and refuses with one plain, typed answer. The
 * dashboard shows its French or English copy from the reason code.
 */

import type { ServerResponse } from 'node:http';
import type { Connection } from 'mongoose';
import { getAuditSlimmedAt } from '@odysseus/store';
import { sendProblem } from '../http-utils.js';

export const RAW_EVIDENCE_REMOVED_MESSAGE =
  'The raw data of this older scan was deleted; run a new scan.';

/** Sends the refusal and returns true when the audit was slimmed. */
export async function refuseSlimmedAudit(
  connection: Connection,
  auditId: string,
  res: ServerResponse,
): Promise<boolean> {
  if ((await getAuditSlimmedAt(connection, auditId)) === undefined) return false;
  sendProblem(res, 409, {
    code: 'action-blocked',
    reasonCode: 'raw-evidence-removed',
    message: RAW_EVIDENCE_REMOVED_MESSAGE,
    retryable: false,
    blockingRef: { auditId },
  });
  return true;
}
