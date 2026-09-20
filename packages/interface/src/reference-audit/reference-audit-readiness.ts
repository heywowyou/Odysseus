import { getReferenceAuditPublicBaseUrl } from '../config.js';
import { createConfiguredReferenceAuditStore } from './configured-reference-audit-store.js';
import { readCurrentReferenceAudit } from './reference-audit-publication.js';

const REFERENCE_AUDIT_PATH = '/exemple-audit';

export interface ReferenceAuditDraftLink {
  url: string;
  referenceVersion: string;
}

/** Readiness is intentionally fail-closed for new Touch 1 drafts. The public
 * artifact may be absent on a developer machine, but a draft must never make
 * a promise to a recipient that the current pointer cannot fulfil. */
export async function resolveReferenceAuditForDraft(): Promise<ReferenceAuditDraftLink | null> {
  try {
    const current = await readCurrentReferenceAudit(createConfiguredReferenceAuditStore());
    if (current === null) return null;
    return {
      url: `${getReferenceAuditPublicBaseUrl().replace(/\/+$/u, '')}${REFERENCE_AUDIT_PATH}`,
      referenceVersion: current.manifest.referenceReleaseVersion,
    };
  } catch {
    return null;
  }
}
