import { createHash } from 'node:crypto';
import type {
  ActionCapability,
  OperatorAttentionItem,
  OperatorSnapshot,
  OperatorWorkView,
} from './contract.js';
import { operatorSnapshotSchema } from './contract.js';
import {
  deriveEvidenceReadiness,
  deriveReportReadiness,
  type EvidenceFacts,
  type ReportQualityFacts,
} from './audit-readiness.js';

/**
 * Plan 060 §5.2: composes one valid OperatorSnapshot for an audit subject
 * from the authoritative facts the caller fetched. The readiness axes come
 * from audit-readiness.ts; work views, capabilities and attention items pass
 * through as the caller projected them. The result is parsed with
 * operatorSnapshotSchema before returning, so an invalid snapshot fails
 * loudly here instead of reaching a control-room surface.
 *
 * stateVersion commits to exactly the authoritative inputs that commands
 * against this subject decide on (the job-capabilities.ts token style):
 *
 *   - the subject identity (prospectId, auditId);
 *   - each work view's identity and execution state (workId, owner,
 *     purpose, state, stage) — the durable fields a command recheck needs;
 *   - the full evidence facts and report facts, whose digests, approval
 *     and production flags are what commands against this subject
 *     precondition on.
 *
 * It deliberately does NOT commit to the display label (siteLabel), work
 * progress/heartbeat fields (a poll tick must never invalidate a click),
 * the attention list (derived from the same committed facts) or the
 * capabilities (each carries its own stateToken over its own inputs).
 */
export interface AuditSnapshotInputs {
  subject: { prospectId?: string; auditId?: string; siteLabel?: string };
  work: OperatorWorkView[];
  evidenceFacts: EvidenceFacts;
  reportFacts: ReportQualityFacts;
  capabilities: Record<string, ActionCapability>;
  attention: OperatorAttentionItem[];
}

function stateVersion(inputs: AuditSnapshotInputs): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'audit-snapshot',
        inputs.subject.prospectId ?? null,
        inputs.subject.auditId ?? null,
        inputs.work.map((work) => [
          work.workId,
          work.owner,
          work.purpose,
          work.state,
          work.stage ?? null,
        ]),
        inputs.evidenceFacts,
        inputs.reportFacts,
      ]),
    )
    .digest('base64url')
    .slice(0, 22);
}

export function buildAuditSnapshot(inputs: AuditSnapshotInputs): OperatorSnapshot {
  return operatorSnapshotSchema.parse({
    subject: inputs.subject,
    work: inputs.work,
    evidence: deriveEvidenceReadiness(inputs.evidenceFacts),
    report: deriveReportReadiness(inputs.reportFacts),
    capabilities: inputs.capabilities,
    attention: inputs.attention,
    stateVersion: stateVersion(inputs),
  });
}
