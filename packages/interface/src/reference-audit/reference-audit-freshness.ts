import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION } from '@odysseus/report';
import { REFERENCE_AUDIT_ANONYMIZER_VERSION } from '@odysseus/report';
import { createConfiguredReferenceAuditStore } from './configured-reference-audit-store.js';
import {
  readCurrentReferenceAudit,
  type ReferenceAuditCurrentManifest,
} from './reference-audit-publication.js';

export type ReferenceAuditFreshnessState = 'current' | 'stale' | 'missing';

export interface ReferenceAuditFreshness {
  state: ReferenceAuditFreshnessState;
  manifest?: ReferenceAuditCurrentManifest;
  reason?:
    | 'not-published'
    | 'storage-unavailable'
    | 'template-changed'
    | 'data-changed'
    | 'anonymizer-changed';
}

/** Pure classification used by both the operator route and tests. Keeping
 * the version comparison separate makes the dashboard status trustworthy
 * without coupling its semantics to the object-store adapter. */
export function classifyReferenceAuditFreshness(
  manifest: ReferenceAuditCurrentManifest | null,
): ReferenceAuditFreshness {
  if (manifest === null) return { state: 'missing', reason: 'not-published' };
  if (manifest.reportTemplateVersion !== REPORT_TEMPLATE_VERSION) {
    return { state: 'stale', manifest, reason: 'template-changed' };
  }
  if (manifest.dataVersion !== NORMALIZATION_FINGERPRINT) {
    return { state: 'stale', manifest, reason: 'data-changed' };
  }
  if (manifest.anonymizerVersion !== REFERENCE_AUDIT_ANONYMIZER_VERSION) {
    return { state: 'stale', manifest, reason: 'anonymizer-changed' };
  }
  return { state: 'current', manifest };
}

export async function inspectReferenceAuditFreshness(): Promise<ReferenceAuditFreshness> {
  let current: Awaited<ReturnType<typeof readCurrentReferenceAudit>>;
  try {
    current = await readCurrentReferenceAudit(createConfiguredReferenceAuditStore());
  } catch {
    return { state: 'missing', reason: 'storage-unavailable' };
  }
  return classifyReferenceAuditFreshness(current?.manifest ?? null);
}
