/** The prospect page's API shapes and small helpers, shared by its panels
 *  (issue #532). */

import type { ProspectHubRow, ProspectStatus } from '../prospect-hub-model';
import type { ProspectStakeholder } from '../prospect-contact-model';

export interface ProspectEvent {
  eventId: string;
  type: string;
  actor: string;
  at: string;
  payload: Record<string, unknown>;
}

/** A creation from the directory reads as its origin, not as a plain
 *  creation (issue #398). */
export function eventLabelKey(event: ProspectEvent): string {
  return event.type === 'prospect-created' && event.payload['origin'] === 'directory'
    ? 'prospect-created-directory'
    : event.type;
}

export interface ProspectAudit {
  auditId: string;
  siteUrl: string;
  kind: string;
  scanIntent?: string;
  startedAt: string;
  finishedAt?: string;
  /** Issue #560: set when retention or an archive slimmed the audit. */
  retention?: { slimmedAt?: string };
}

export interface ProspectPreview {
  previewId: string;
  status: string;
  publishedAt: string;
  publicExpiresAt: string;
  revokedAt?: string;
  revokedReason?: string;
  url?: string;
}

export type ProspectOutreachAction = 'preview' | 'first-email' | 'follow-up';

export interface ProspectActionability {
  actions: Record<string, { state: 'available' | 'blocked'; reason?: string }>;
}

export type ProspectRecommendationAction =
  | 'review-audit'
  | 'regenerate-report'
  | 'review-draft'
  | 'record-outcome'
  | 'create-follow-up'
  | 'create-first-email'
  | 'prepare-audit'
  | 'review-prospect';

export interface ProspectWorkSummary {
  items: { kind: string; action: string; href: string; since: string }[];
  recommendation?: {
    action: ProspectRecommendationAction;
    href: string;
    reason?: string;
  };
  auditState: string;
  qualifyingAuditId?: string;
  /** Issue #390: the prospect's queued or running scan. */
  activeScan?: { jobId: string; status: 'queued' | 'running'; scanIntent?: string };
  /** Advisory provenance of the qualifying audit; never a blocker. */
  dataVersionState?: 'current' | 'older' | 'unknown';
  websiteSuppressed: boolean;
  emailSuppressed: boolean;
}

export interface ProspectThread {
  threadId: string;
  state: string;
  currentTouch: number;
  stateEnteredAt: string;
  /** Confirmed sends, in touch order. `sentAt` is the provider's own send
   *  time, or the moment the operator confirmed a send by hand. */
  touches: { touch: number; sentAt: string }[];
  updatedAt: string;
  needsReview?: { reason: string; detectedAt: string };
}

export interface ProspectDraft {
  draftId: string;
  touch: number;
  status: string;
  reviewOutcome?: 'approved' | 'skipped';
  subject: string;
  body?: string;
  recipient?: string;
  mailboxUrl?: string;
  language?: 'fr' | 'en';
  previewUrl?: string;
  referenceAuditUrl?: string;
  referenceAuditVersion?: string;
  referenceAuditFirstRequestedAt?: string;
  referenceAuditLastRequestedAt?: string;
  referenceAuditRequestCount?: number;
  createdAt: string;
}

export interface ProspectHubDetail extends ProspectHubRow {
  address?: string;
  postcode?: string;
  phone?: string;
  siren?: string;
  siret?: string;
  /** Issue #289: prospect-level identity, editable before any scan. */
  tradingName?: string;
  legalName?: string;
  notes?: string;
  outreachLanguage?: 'fr' | 'en';
  stakeholders?: ProspectStakeholder[];
  fieldOrigins: Record<string, string>;
  audits?: ProspectAudit[];
  previews?: ProspectPreview[];
  /** A role address a scan read on the site, with the page it came from. */
  contactSuggestion?: { address: string; sourceUrl: string } | null;
  events: ProspectEvent[];
  work?: ProspectWorkSummary;
  thread?: ProspectThread | null;
  drafts?: ProspectDraft[];
}

export const STATUSES: readonly ProspectStatus[] = [
  'new',
  'audited',
  'contacted',
  'follow-up',
  'replied',
  'call',
  'quoted',
  'won',
  'lost',
  'opted-out',
];

export const OUTCOMES = [
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'opt-out',
  'call',
  'quoted',
  'won',
  'lost',
] as const;

export const TERMINAL_STATUSES: readonly ProspectStatus[] = ['won', 'lost', 'opted-out'];

export function label(value: string, labels: Record<string, string>): string {
  return labels[value] ?? value;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since a scan started. Informational only: no age makes a
 *  scan unusable, the operator decides when the site may have changed. */
export function daysSince(value: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / DAY_MS));
}

export function permanentDeleteDescription(
  impact: readonly string[],
  copy: {
    deletePermanentlyIntro: string;
    deletePermanentlyWith: string;
    deletePermanentlyKeeps: string;
  },
): string {
  const scope =
    impact.length === 0
      ? copy.deletePermanentlyIntro
      : `${copy.deletePermanentlyIntro} ${copy.deletePermanentlyWith} ${impact.join(', ')}`;
  return `${scope}. ${copy.deletePermanentlyKeeps}`;
}
