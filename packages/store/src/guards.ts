import type { Connection } from 'mongoose';
import { normalizeDeclaredWebsite, type Prospect } from '@odysseus/core';
import { createAuditModel } from './schemas/audit.schema.js';
import { findActiveBrowserHeavyHostConflict } from './active-jobs.js';
import {
  selectNewestQualifyingAudit,
  type ProspectAuditQualificationState,
  type ProspectWorkAudit,
} from './prospect-work.js';
import { isSuppressed } from './suppression.js';

export type ScanLaunchRefusal = 'invalid-url' | 'suppressed' | 'host-busy';
export type OutreachActionRefusal =
  'suppressed' | 'no-contact' | 'no-complete-audit' | 'audit-stale';
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

function registrableDomainOf(url: string): string | null {
  const resolution = normalizeDeclaredWebsite(url);
  return resolution.kind === 'unusable' ? null : resolution.registrableDomain;
}

export async function checkScanLaunch(
  connection: Connection,
  input: { url: string; kind: 'quick-check' | 'prospecting-audit' | 'full-audit' },
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
  const domain = registrableDomainOf(input.url);
  if (domain === null) return { allowed: false, refusal: 'invalid-url' };
  if (await isSuppressed(connection, domain)) return { allowed: false, refusal: 'suppressed' };
  if (input.kind !== 'quick-check') {
    const conflict = await findActiveBrowserHeavyHostConflict(
      connection,
      input.kind,
      parsed.hostname,
    );
    if (conflict !== null) return { allowed: false, refusal: 'host-busy' };
  }
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
  if (input.action === 'follow-up') return { allowed: true };
  const audits = await createAuditModel(connection)
    .find({ prospectId: input.prospect.prospectId })
    .select({
      _id: 0,
      auditId: 1,
      prospectId: 1,
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
  const qualification = selectNewestQualifyingAudit(audits);
  if (qualification.audit === undefined) {
    return {
      allowed: false,
      refusal: qualification.state === 'stale' ? 'audit-stale' : 'no-complete-audit',
      auditState: qualification.state,
    };
  }
  return { allowed: true, audit: qualification.audit };
}
