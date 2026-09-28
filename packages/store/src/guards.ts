import type { Connection } from 'mongoose';
import {
  normalizeDeclaredWebsite,
  type Prospect,
  emailDomain,
  primaryWebsite,
} from '@odysseus/core';
import { createAuditModel } from './schemas/audit.schema.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { planProspectJobLaunch } from './active-jobs.js';
import { createJobModel } from './schemas/job.schema.js';
import {
  selectNewestQualifyingAudit,
  type ProspectAuditQualificationState,
  type ProspectWorkAudit,
} from './prospect-work.js';
import {
  effectiveAuditScanIntent,
  type AuditDataVersionState,
  type AuditIntentSourceJob,
} from './prospect-audit-qualification.js';
import type { CurrentScanIntent } from './scan-intents.js';
import { isSuppressed } from './suppression.js';
import {
  TERMINAL_OUTREACH_THREAD_STATES,
  draftedOutreachTouch,
  effectiveOutreachThreadState,
} from '@odysseus/core';
import { findLiveOutreachDraft, findUnverifiedProviderDraft } from './outreach-drafts.js';
import { findOutreachThreadByProspect, followUpDueAt } from './outreach-threads.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import {
  loadOutreachReportReadiness,
  type OutreachReportNotReadyReason,
} from './outreach-report-readiness.js';

export type ScanLaunchRefusal = 'invalid-url' | 'suppressed' | 'host-busy';
export type OutreachActionRefusal =
  | 'suppressed'
  | 'no-contact'
  | 'no-complete-audit'
  | 'report-not-ready'
  | 'draft-already-live'
  | 'provider-draft-unverified'
  | 'thread-closed'
  | 'thread-unknown'
  | 'thread-not-eligible'
  | 'follow-up-not-due'
  | 'thread-needs-review'
  | 'thread-already-started'
  | 'preview-already-live'
  | 'prospect-outreach-already-started';
export type OutreachAction = 'preview' | 'first-email' | 'follow-up';

export type ScanLaunchCheck =
  | { allowed: true; registrableDomain: string }
  | {
      allowed: false;
      refusal: ScanLaunchRefusal;
      /** With 'host-busy': the queued or running job holding the slot. */
      conflictingJobId?: string;
    };
export type OutreachActionCheck =
  | {
      allowed: true;
      audit?: ProspectWorkAudit;
      /** Advisory: an older data version is a warning, never a refusal. */
      dataVersionState?: AuditDataVersionState;
    }
  | {
      allowed: false;
      refusal: OutreachActionRefusal;
      auditState?: ProspectAuditQualificationState;
      /** With 'report-not-ready': why, so the caller names the remedy. */
      reportState?: OutreachReportNotReadyReason;
      /** With 'report-not-ready': the qualifying audit to regenerate. */
      auditId?: string;
    };

export function registrableDomainForScan(url: string): string | null {
  const resolution = normalizeDeclaredWebsite(url);
  return resolution.kind === 'unusable' ? null : resolution.registrableDomain;
}

export async function checkScanLaunch(
  connection: Connection,
  input: {
    url: string;
    kind: CurrentScanIntent;
    prospectId?: string;
  },
): Promise<ScanLaunchCheck> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { allowed: false, refusal: 'invalid-url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, refusal: 'invalid-url' };
  }
  const domain = registrableDomainForScan(input.url);
  if (domain === null) return { allowed: false, refusal: 'invalid-url' };
  if (await isSuppressed(connection, domain)) return { allowed: false, refusal: 'suppressed' };
  const launch = await planProspectJobLaunch(connection, {
    kind: input.kind,
    domain,
    hostname: parsed.hostname,
    ...(input.prospectId === undefined ? {} : { prospectId: input.prospectId }),
  });
  if (!launch.allowed) {
    return { allowed: false, refusal: 'host-busy', conflictingJobId: launch.conflictingJobId };
  }
  return { allowed: true, registrableDomain: domain };
}

export async function checkOutreachAction(
  connection: Connection,
  input: { prospect: Prospect; action: OutreachAction; now?: Date },
): Promise<OutreachActionCheck> {
  const website = primaryWebsite(input.prospect.websites);
  const domain = website?.registrableDomain;
  const websiteSuppressed = domain === undefined ? false : await isSuppressed(connection, domain);
  const addressSuppressed = (
    await Promise.all(
      input.prospect.emails.map((email) =>
        // A malformed address has no domain row to match; its own address
        // row still does.
        isSuppressed(connection, emailDomain(email.address) ?? '', email.address),
      ),
    )
  ).some(Boolean);
  if (websiteSuppressed || addressSuppressed) {
    return { allowed: false, refusal: 'suppressed' };
  }
  // Issue #395: refusals follow the workflow order (scan, then email, then
  // preview or draft), so the operator is told the earliest missing
  // prerequisite rather than the cheapest field to fill.
  const hasContact = input.prospect.emails.length > 0;
  // Issue #279: the thread facts the draft runtime refuses on are checked
  // here too, so a gate never shows an action as ready that the server
  // would then refuse.
  const thread = await findOutreachThreadByProspect(connection, input.prospect.prospectId);
  if (thread !== null && TERMINAL_OUTREACH_THREAD_STATES.includes(thread.state)) {
    return { allowed: false, refusal: 'thread-closed' };
  }
  if (input.action === 'follow-up') {
    if (thread === null) return { allowed: false, refusal: 'thread-unknown' };
    if (!hasContact) return { allowed: false, refusal: 'no-contact' };
    // A discarded follow-up draft leaves the thread drafted; it is due again.
    const drafted = draftedOutreachTouch(thread.state);
    const state = effectiveOutreachThreadState(
      thread.state,
      drafted !== undefined &&
        (await findLiveOutreachDraft(connection, thread.threadId, drafted)) !== null
        ? [drafted]
        : [],
    );
    const touch = state === 'e1-sent' ? 2 : state === 'e2-sent' ? 3 : undefined;
    if (touch === undefined) return { allowed: false, refusal: 'thread-not-eligible' };
    if ((await findLiveOutreachDraft(connection, thread.threadId, touch)) !== null) {
      return { allowed: false, refusal: 'draft-already-live' };
    }
    // Issue #552: an earlier request for this touch may have left a draft in
    // the mailbox; the operator checks before another one is made.
    if ((await findUnverifiedProviderDraft(connection, thread.threadId, touch)) !== null) {
      return { allowed: false, refusal: 'provider-draft-unverified' };
    }
    // Issue #479: the same rules the due list and To-do apply. An automated
    // answer or an unexplained mailbox state waits for a person, and the
    // spacing (day +4, then +7) is part of the outreach rules.
    if (thread.needsReview !== undefined) {
      return { allowed: false, refusal: 'thread-needs-review' };
    }
    const dueAt = followUpDueAt({ ...thread, state });
    if (dueAt === undefined || dueAt.getTime() > (input.now ?? new Date()).getTime()) {
      return { allowed: false, refusal: 'follow-up-not-due' };
    }
    return { allowed: true };
  }
  const audits = await createAuditModel(connection)
    .find({ prospectId: input.prospect.prospectId })
    .select({
      _id: 0,
      auditId: 1,
      prospectId: 1,
      scanIntent: 1,
      siteUrl: 1,
      kind: 1,
      startedAt: 1,
      finishedAt: 1,
      pages: 1,
      'crawl.sitemapCoverage': 1,
      'findingsProvenance.normalizationFingerprint': 1,
    })
    .sort({ startedAt: -1 })
    .lean<ProspectWorkAudit[]>();
  const auditIds = audits.map((audit) => audit.auditId);
  const jobScope: Record<string, unknown>[] = [{ 'options.prospectId': input.prospect.prospectId }];
  if (auditIds.length > 0) {
    jobScope.push({ auditId: { $in: auditIds } }, { auditIds: { $in: auditIds } });
  }
  const jobs = await createJobModel(connection)
    .find({ $or: jobScope })
    .select({ _id: 0, type: 1, auditId: 1, auditIds: 1, 'options.scanType': 1 })
    .lean<AuditIntentSourceJob[]>();
  const classifiedAudits = audits.map((audit) => {
    const scanIntent = effectiveAuditScanIntent(audit, jobs);
    return scanIntent === undefined ? audit : { ...audit, scanIntent };
  });
  const qualification = selectNewestQualifyingAudit(classifiedAudits);
  if (qualification.audit === undefined) {
    return { allowed: false, refusal: 'no-complete-audit', auditState: qualification.state };
  }
  if (!hasContact) return { allowed: false, refusal: 'no-contact' };
  // Issue #280: one live preview per outreach attempt. Publishing another
  // would silently supersede the link the operator already copied.
  if (
    input.action === 'preview' &&
    (await createOutreachPreviewModel(connection).exists({
      prospectId: input.prospect.prospectId,
      status: 'live',
    })) !== null
  ) {
    return { allowed: false, refusal: 'preview-already-live' };
  }
  if (input.action === 'first-email' && !['new', 'audited'].includes(input.prospect.status)) {
    return { allowed: false, refusal: 'prospect-outreach-already-started' };
  }
  if (input.action === 'first-email') {
    const sentFirstTouch = await createProspectEventModel(connection).exists({
      prospectId: input.prospect.prospectId,
      type: 'status-changed',
      actor: 'automation',
      'payload.to': 'contacted',
    });
    if (sentFirstTouch !== null) {
      return { allowed: false, refusal: 'prospect-outreach-already-started' };
    }
  }
  if (input.action === 'first-email' && thread !== null) {
    if ((await findLiveOutreachDraft(connection, thread.threadId, 1)) !== null) {
      return { allowed: false, refusal: 'draft-already-live' };
    }
    if ((await findUnverifiedProviderDraft(connection, thread.threadId, 1)) !== null) {
      return { allowed: false, refusal: 'provider-draft-unverified' };
    }
    if (thread.state !== 'open' && thread.state !== 'e1-drafted') {
      return { allowed: false, refusal: 'thread-already-started' };
    }
  }
  // Issue #388: the preview and the first email both stand on the audit's
  // client report, so initial outreach waits for a current French report.
  // The same resolver decides the To do rows, so the API cannot bypass them.
  const readiness = await loadOutreachReportReadiness(connection, {
    auditId: qualification.audit.auditId,
    prospectId: input.prospect.prospectId,
  });
  if (readiness.state === 'not-ready') {
    return {
      allowed: false,
      refusal: 'report-not-ready',
      reportState: readiness.reason,
      auditId: qualification.audit.auditId,
    };
  }
  return {
    allowed: true,
    audit: qualification.audit,
    dataVersionState: qualification.dataVersionState,
  };
}
