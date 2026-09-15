/** Business effects that happen after a scanner stage has persisted its
 *  audit. Keeping this seam outside runAuditStage prevents generic batch
 *  scans and informational Quick Checks from changing prospect workflow
 *  state merely because their crawl happened to be complete. */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { AuditManifest } from '@odysseus/core';
import {
  advanceProspectStatus,
  appendProspectEvent,
  isOutreachQualifyingAudit,
} from '@odysseus/store';

export async function finalizeProspectScan(
  connection: Connection,
  input: { prospectId: string; manifest: AuditManifest; actor?: string },
): Promise<void> {
  const actor = input.actor ?? 'scanner';
  await appendProspectEvent(connection, {
    eventId: randomUUID(),
    prospectId: input.prospectId,
    type: 'scan-attached',
    payload: {
      auditId: input.manifest.auditId,
      ...(input.manifest.scanIntent === undefined ? {} : { scanIntent: input.manifest.scanIntent }),
    },
    actor,
    at: new Date(),
  });

  if (isOutreachQualifyingAudit(input.manifest)) {
    await advanceProspectStatus(connection, input.prospectId, 'audited', actor);
  }
}
