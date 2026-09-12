/**
 * Plan 045 slices 1.4/1.5: idempotent, bounded backfill for audits that
 * finished before linkAuditToHotelByDomain existed (audit-stage.ts calls
 * it for every audit going forward, right after persistAudit). Run once
 * per queue startup, beside reconcileFailedAuditJobs, so an existing
 * stuck audit - "Les Flots Bleus" in plan 045's own context, whose cover
 * carried "Site Officiel" and a detected raison sociale belonging to its
 * web host - eventually gains the same hotel association and the same
 * better cover-name suggestions a fresh audit gets automatically, without
 * a one-off migration script to run and forget.
 *
 * Bounded the same way reconcileFailedAuditJobs is: a pathological
 * backlog of unlinked audits must not turn every queue start into an
 * unbounded scan. A remaining backlog is simply picked up on the next
 * startup.
 */

import type { Connection } from 'mongoose';
import {
  createAuditModel,
  linkAuditToHotelByDomain,
  replaceDetectedManualFields,
} from '@odysseus/store';
import { resolveCoverPrefill } from './audit-stage.js';

const MAX_AUDITS_PER_PASS = 200;

/** Returns the number of audits newly linked to a hotel candidate this
 *  pass (not the number of manual-field writes, which can be fewer when
 *  the better suggestion is gated out by the NAF check, or zero when
 *  every candidate-derived field already carries operator provenance). */
export async function backfillAuditHotelLinks(connection: Connection): Promise<number> {
  const AuditModel = createAuditModel(connection);
  const unlinked = await AuditModel.find(
    { outreach: { $exists: false }, hotelLink: { $exists: false } },
    { _id: 0, auditId: 1, siteUrl: 1 },
  )
    .limit(MAX_AUDITS_PER_PASS)
    .lean<{ auditId: string; siteUrl: string }[]>();

  let linked = 0;
  for (const audit of unlinked) {
    const { candidate } = await linkAuditToHotelByDomain(connection, audit.auditId, audit.siteUrl);
    if (!candidate) continue;
    linked += 1;

    // No registrySnapshot is available for an already-persisted audit
    // (obligation-stage.ts's assessment was never stored on the audit
    // document itself) - passing 'undetermined' with no basis makes
    // resolveCoverPrefill skip that half and rely on the linked
    // candidate's own catalogue name and Sirene join only, exactly the
    // improvement this backfill exists to deliver.
    const coverPrefill = await resolveCoverPrefill(
      connection,
      candidate,
      { status: 'undetermined', basis: [] },
      undefined,
      undefined,
    );
    await replaceDetectedManualFields(connection, audit.auditId, coverPrefill);
  }

  return linked;
}
