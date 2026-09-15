import type { Connection } from 'mongoose';
import { normalizeDeclaredWebsite, type Prospect } from '@odysseus/core';
import { createAuditModel } from './schemas/audit.schema.js';
import { planProspectJobLaunch } from './active-jobs.js';
import { createJobModel } from './schemas/job.schema.js';
import {
  selectNewestQualifyingAudit,
  type ProspectAuditQualificationState,
  type ProspectWorkAudit,
} from './prospect-work.js';
import {
  effectiveAuditScanIntent,
  type AuditIntentSourceJob,
} from './prospect-audit-qualification.js';
import { isSuppressed } from './suppression.js';
import { TERMINAL_OUTREACH_THREAD_STATES } from '@odysseus/core';
import { findLiveOutreachDraft } from './outreach-drafts.js';
import { findOutreachThreadByProspect } from './outreach-threads.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';

export type ScanLaunchRefusal = 'invalid-url' | 'suppressed' | 'host-busy';
export type OutreachActionRefusal =
  | 'suppressed'
  | 'no-contact'
  | 'no-complete-audit'
  | 'audit-stale'
  | 'draft-already-live'
  | 'thread-closed'
  | 'thread-unknown'
  | 'thread-not-eligible'
  | 'thread-already-started'
  | 'preview-already-live';
export type OutreachAction = 'preview' | 'first-email' | 'follow-up';

export type ScanLaunchCheck =
  { allowed: true; registrableDomain: string } | { allowed: false; refusal: ScanLaunchRefusal };
export type OutreachActionCheck =
  | { allowed: true; audit?: ProspectWorkAudit }
  | {
      allowed: false;
      refusal: OutreachActionRefusal;
      auditState?: ProspectAuditQualificationState;
    };

export function registrableDomainForScan(url: string): string | null {
  const resolution = normalizeDeclaredWebsite(url);
  return resolution.kind === 'unusable' ? null : resolution.registrableDomain;
}

export async function checkScanLaunch(
  connection: Connection,
  input: {
    url: string;
    kind: 'quick-check' | 'prospecting-audit' | 'full-audit';
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
  if (!launch.allowed) return { allowed: false, refusal: 'host-busy' };
  return { allowed: true, registrableDomain: domain };
}

export async function checkOutreachAction(
  connection: Connection,
  input: { prospect: Prospect; action: OutreachAction },
): Promise<OutreachActionCheck> {
  const website =
    input.prospect.websites.find((candidate) => candidate.primary) ?? input.prospect.websites[0];
  const domain = website?.registrableDomain;
  const websiteSuppressed = domain === undefined ? false : await isSuppressed(connection, domain);
  const addressSuppressed = (
    await Promise.all(
      input.prospect.emails.map((email) => {
        const addressDomain = email.address.slice(email.address.lastIndexOf('@') + 1);
        return isSuppressed(connection, addressDomain, email.address);
      }),
    )
  ).some(Boolean);
  if (websiteSuppressed || addressSuppressed) {
    return { allowed: false, refusal: 'suppressed' };
  }
  if (input.prospect.emails.length === 0) return { allowed: false, refusal: 'no-contact' };
  // Issue #279: the thread facts the draft runtime refuses on are checked
  // here too, so a gate never shows an action as ready that the server
  // would then refuse.
  const thread = await findOutreachThreadByProspect(connection, input.prospect.prospectId);
  if (thread !== null && TERMINAL_OUTREACH_THREAD_STATES.includes(thread.state)) {
    return { allowed: false, refusal: 'thread-closed' };
  }
  if (input.action === 'follow-up') {
    if (thread === null) return { allowed: false, refusal: 'thread-unknown' };
    const touch = thread.state === 'e1-sent' ? 2 : thread.state === 'e2-sent' ? 3 : undefined;
    if (touch === undefined) return { allowed: false, refusal: 'thread-not-eligible' };
    if ((await findLiveOutreachDraft(connection, thread.threadId, touch)) !== null) {
      return { allowed: false, refusal: 'draft-already-live' };
    }
    return { allowed: true };
  }
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
  if (input.action === 'first-email' && thread !== null) {
    if ((await findLiveOutreachDraft(connection, thread.threadId, 1)) !== null) {
      return { allowed: false, refusal: 'draft-already-live' };
    }
    if (thread.state !== 'open' && thread.state !== 'e1-drafted') {
      return { allowed: false, refusal: 'thread-already-started' };
    }
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
    return {
      allowed: false,
      refusal: qualification.state === 'stale' ? 'audit-stale' : 'no-complete-audit',
      auditState: qualification.state,
    };
  }
  return { allowed: true, audit: qualification.audit };
}
