import type { CapabilityBlockReason, CapabilityConsequence } from './contract.js';

/**
 * Plan 060 §16.1/§19: the ConsequentialActionRegistry — one typed row per
 * consequential (state-changing) mutation the dashboard can trigger, derived
 * from the routes server.ts actually registers. It is the closed set the
 * operator snapshot's `capabilities` keys (plan 060 §6.1) and the
 * route-inventory test (action-registry.test.ts) are written against: a new
 * mutation route without a row here fails that test instead of silently
 * inheriting a default.
 *
 * Two command protocols exist today:
 *
 * - `state-token` — the read response carries a capability whose stateToken
 *   digests exactly the authoritative inputs below (operator/
 *   job-capabilities.ts), the command echoes it, and the server recomputes
 *   the capability from freshly loaded state and answers the typed
 *   `state-changed` problem on a mismatch (plan 061 §8.2). Today: scan
 *   cancel, scan delete, queue reorder.
 * - `reload-recheck` — the command reloads authoritative state server-side
 *   and re-evaluates its guard before acting (approve-reports' double
 *   fresh-pair read in one transaction, the quality bundle's exact digest
 *   match, archive/delete's unfinished-work guards). Staleness is caught by
 *   that recheck, not by a client-held token; plan 061 upgrades these rows.
 *
 * Nothing here carries localized prose. Rows may only use the closed codes
 * of `contract.ts`; the copy-coverage test proves every one of them has
 * FR/EN copy.
 */

export type ConsequentialActionOwner =
  | 'scan-job'
  | 'prospect-store'
  | 'audit-evidence'
  | 'report-quality'
  | 'outreach'
  | 'report-preparation';

export type CommandProtocol = 'state-token' | 'reload-recheck';

export interface ConsequentialAction<A extends string = string> {
  /** Stable camelCase code; the key an operator snapshot's capabilities
   *  record uses for this action (plan 060 §6.1). */
  action: A;
  /** The domain policy that owns the command's guard (plan 060 §6.2). The
   *  `audit-evidence` owner (Plan-059 evidence repair/approval) has no
   *  dashboard mutation route yet: evidence approval is fail-closed by
   *  construction, so no row exists for it today. */
  owner: ConsequentialActionOwner;
  /** Exact METHOD + path pattern as registered, verbatim. */
  routes: readonly string[];
  /** For `state-token` rows: the authoritative inputs the token commits to
   *  (operator/job-capabilities.ts digests). `reload-recheck` rows carry no
   *  token; their guard re-reads state instead. */
  tokenInputs?: readonly string[];
  protocol: CommandProtocol;
  /** Consequences a capability may declare when available, from
   *  CAPABILITY_CONSEQUENCES; absent when the contract has none. */
  consequenceCodes?: readonly CapabilityConsequence[];
  /** Blocking reasons the command's recheck can answer, from
   *  CAPABILITY_BLOCK_REASONS; absent when it refuses only with the typed
   *  problem codes (state-changed / not-found / invalid-request). */
  blockedReasonCodes?: readonly CapabilityBlockReason[];
  /** Plan 061 must upgrade this row to the full state-token protocol
   *  (§6.3: every mutation whose safety can change after the screen
   *  renders). True exactly for the rows not yet on `state-token`. */
  pendingPlan061: boolean;
}

/**
 * The registry. Order follows server.ts's own registration order, one row
 * per mutating route pair where one action spans several (websites/emails
 * primary and removal are two operations each and get two rows).
 */
export const REGISTRY_ACTIONS = [
  // --- scan-job (queue/job policy, plan 061 §7-9) -------------------------
  {
    action: 'startScan',
    owner: 'scan-job',
    routes: ['POST /api/scans'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'startScanBatch',
    owner: 'scan-job',
    routes: ['POST /api/scans/batch'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'cancelScan',
    owner: 'scan-job',
    routes: ['POST /api/scans/:jobId/cancel'],
    tokenInputs: ['job.status', 'job.type'],
    protocol: 'state-token',
    consequenceCodes: ['removes-from-queue', 'stops-at-safe-boundary'],
    blockedReasonCodes: ['already-terminal', 'cancel-already-requested', 'not-stoppable'],
    pendingPlan061: false,
  },
  {
    action: 'deleteScan',
    owner: 'scan-job',
    routes: ['DELETE /api/scans/:jobId'],
    tokenInputs: ['job.status', 'worker-in-flight', 'report-production-lock', 'job.auditIds'],
    protocol: 'state-token',
    consequenceCodes: ['deletes-history-only', 'deletes-audits'],
    blockedReasonCodes: ['work-running', 'work-finishing', 'report-production-in-flight'],
    pendingPlan061: false,
  },
  {
    action: 'clearScanQueue',
    owner: 'scan-job',
    routes: ['POST /api/scans/queue/clear'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'reorderScanQueue',
    owner: 'scan-job',
    routes: ['POST /api/scans/queue/reorder'],
    // The queue revision is this command's token: it digests the waiting
    // set and its order (store's readScanQueue/reorderScanQueue).
    tokenInputs: ['queue-membership', 'queue-order'],
    protocol: 'state-token',
    pendingPlan061: false,
  },

  // --- report-quality (Plan-058 candidate/approval/promotion policy) ------
  {
    action: 'runReportQuality',
    owner: 'report-quality',
    routes: ['POST /api/audits/:auditId/report-quality'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'approveReportQualityBundle',
    owner: 'report-quality',
    routes: ['POST /api/audits/:auditId/report-quality/approve'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'approveReports',
    owner: 'report-quality',
    routes: ['POST /api/audits/:auditId/approve-reports'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'overrideGrade',
    owner: 'report-quality',
    routes: ['PUT /api/audits/:auditId/grade-override'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'clearGradeOverride',
    owner: 'report-quality',
    routes: ['DELETE /api/audits/:auditId/grade-override'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },

  // --- report-preparation (Prepare-report workflow inputs and remedies) ---
  {
    action: 'editManualFields',
    owner: 'report-preparation',
    routes: ['PATCH /api/audits/:auditId/manual-fields'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'confirmManualField',
    owner: 'report-preparation',
    routes: ['POST /api/audits/:auditId/manual-fields/confirm'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'regenerateReport',
    owner: 'report-preparation',
    routes: ['POST /api/audits/:auditId/regenerate-report'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'editReportPreparation',
    owner: 'report-preparation',
    routes: ['PATCH /api/audits/:auditId/report-preparation'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'regenerateWriting',
    owner: 'report-preparation',
    routes: ['POST /api/audits/:auditId/report-preparation/regenerate-writing'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },

  // --- outreach (existing outreach policy) --------------------------------
  {
    action: 'createFirstEmail',
    owner: 'outreach',
    routes: ['POST /api/prospects/:prospectId/outreach/first-email'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'createFollowUp',
    owner: 'outreach',
    routes: ['POST /api/prospects/:prospectId/outreach/follow-up'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'discardDraft',
    owner: 'outreach',
    routes: ['POST /api/prospects/:prospectId/drafts/:draftId/discard'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'publishProspectPreview',
    owner: 'outreach',
    routes: ['POST /api/prospects/:prospectId/preview/publish'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'revokeProspectPreview',
    owner: 'outreach',
    routes: ['POST /api/prospects/:prospectId/previews/:previewId/revoke'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'publishAuditPreview',
    owner: 'outreach',
    routes: ['POST /api/audits/:auditId/outreach-preview/publish'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'syncMailbox',
    owner: 'outreach',
    routes: ['POST /api/outreach/mailbox-sync'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },

  // --- prospect-store (prospect lifecycle/identity policy) ----------------
  {
    action: 'createProspect',
    owner: 'prospect-store',
    routes: ['POST /api/prospects'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'addFromDirectory',
    owner: 'prospect-store',
    routes: ['POST /api/directory/add'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'attachAuditProspect',
    owner: 'prospect-store',
    routes: ['POST /api/audits/:auditId/prospect'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'editProspect',
    owner: 'prospect-store',
    routes: ['PATCH /api/prospects/:prospectId'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'setPrimaryWebsite',
    owner: 'prospect-store',
    routes: ['POST /api/prospects/:prospectId/websites/primary'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'removeProspectWebsite',
    owner: 'prospect-store',
    routes: ['DELETE /api/prospects/:prospectId/websites'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'setPrimaryEmail',
    owner: 'prospect-store',
    routes: ['POST /api/prospects/:prospectId/emails/primary'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'removeProspectEmail',
    owner: 'prospect-store',
    routes: ['DELETE /api/prospects/:prospectId/emails'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'setProspectStatus',
    owner: 'prospect-store',
    routes: ['PATCH /api/prospects/:prospectId/status'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'recordProspectOutcome',
    owner: 'prospect-store',
    routes: ['POST /api/prospects/:prospectId/outcome'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'archiveProspect',
    owner: 'prospect-store',
    routes: ['POST /api/prospects/:prospectId/archive'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'restoreProspect',
    owner: 'prospect-store',
    routes: ['POST /api/prospects/:prospectId/restore'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
  {
    action: 'deleteProspect',
    owner: 'prospect-store',
    routes: ['DELETE /api/prospects/:prospectId'],
    protocol: 'reload-recheck',
    pendingPlan061: true,
  },
] as const satisfies readonly ConsequentialAction[];

/** The closed action-code vocabulary, as a runtime list and the union
 *  derived from it — the same pattern as contract.ts's own vocabularies. */
export const CONSEQUENTIAL_ACTION_CODES: readonly ConsequentialAction['action'][] =
  REGISTRY_ACTIONS.map((row) => row.action);
export type ConsequentialActionCode = (typeof CONSEQUENTIAL_ACTION_CODES)[number];

export type ConsequentialActionRegistry = Record<ConsequentialActionCode, ConsequentialAction>;

/** The same rows keyed by action code, for capability-record consumers. */
export const ACTION_REGISTRY: ConsequentialActionRegistry = Object.fromEntries(
  REGISTRY_ACTIONS.map((row) => [row.action, row]),
) as ConsequentialActionRegistry;
