/**
 * Decisions behind the prospect detail page's actions, kept out of the page
 * so they can be tested without rendering it: what a website or email
 * addition sends, which details patch a save sends, and which notice the
 * operator reads after an action succeeds, is refused, or fails.
 */

import type { DashboardStrings } from '../i18n/types';
import { ApiError } from '../lib/api';
import { normalizeSiren } from './audit-detail-model';

type DetailCopy = DashboardStrings['prospectHub']['detail'];

/** The drafts the page lists. A discarded draft is gone for the operator:
 *  listing it would keep the prospect looking drafted after a return to its
 *  audited state. A failed attempt never became a draft; its refusal was
 *  shown when it happened, and its links point at a preview already taken
 *  offline. Both rows stay stored for history. */
export function visibleDrafts<T extends { status: string; reviewOutcome?: string }>(
  drafts: readonly T[],
): T[] {
  return drafts.filter((draft) => draft.reviewOutcome !== 'skipped' && draft.status !== 'failed');
}

export interface DetailWebsite {
  url: string;
  registrableDomain: string;
  kind: string;
  primary: boolean;
}

export type WebsiteAddition =
  { kind: 'invalid' } | { kind: 'unchanged' } | { kind: 'add'; websites: DetailWebsite[] };

/** A typed website becomes the prospect's websites plus one. Only http and
 *  https URLs are accepted; the first website added becomes primary. */
export function websiteAddition(
  websites: readonly DetailWebsite[],
  typed: string,
): WebsiteAddition {
  const value = typed.trim();
  if (!value) return { kind: 'unchanged' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'invalid' };
  const normalizedUrl = url.toString();
  if (websites.some((item) => item.url === normalizedUrl)) return { kind: 'unchanged' };
  return {
    kind: 'add',
    websites: [
      ...websites,
      {
        url: normalizedUrl,
        registrableDomain: url.hostname,
        kind: 'unknown',
        primary: websites.length === 0,
      },
    ],
  };
}

export interface DetailEmail {
  address: string;
  origin: string;
  attestation?: string;
}

/** The emails to save after adding a typed address or accepting a
 *  discovered one, or null when there is nothing new to add. */
export function emailAddition(
  emails: readonly DetailEmail[],
  typed: string,
  suggestion?: { address: string; sourceUrl: string },
): DetailEmail[] | null {
  const address = (suggestion?.address ?? typed).trim().toLowerCase();
  if (!address || emails.some((item) => item.address === address)) return null;
  return [
    ...emails,
    suggestion === undefined
      ? { address, origin: 'operator' }
      : { address, origin: 'site-discovery', attestation: suggestion.sourceUrl },
  ];
}

/** The details PATCH body: trimmed values, an emptied field removed, and
 *  the SIREN normalized. Null when nothing was edited. */
export function detailsPatch(
  editedFields: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> | null {
  const patch = Object.fromEntries(
    Object.entries(editedFields).map(([key, value]) => [
      key,
      key === 'siren'
        ? normalizeSiren(value?.trim() ?? '') || undefined
        : value?.trim() || undefined,
    ]),
  );
  return Object.keys(patch).length === 0 ? null : patch;
}

/** The first-email request body: the live preview's token when one is
 *  live, so the server reuses that preview instead of publishing another. */
export function firstEmailBody(livePreviewUrl: string | null): {
  previewToken?: string | undefined;
} {
  return livePreviewUrl === null ? {} : { previewToken: livePreviewUrl.split('/').at(-1) };
}

function refusalLabel(copy: DetailCopy, fallback: string, refusal: string | undefined): string {
  return copy.actionRefused.replace('{reason}', copy.refusalLabels[refusal ?? ''] ?? fallback);
}

/** Notice after publishing a preview or creating a draft. */
export function outreachResultNotice(
  copy: DetailCopy,
  fallback: string,
  result: { done: boolean; refusal?: string | undefined },
  doneNotice: string,
): string {
  return result.done ? doneNotice : refusalLabel(copy, fallback, result.refusal);
}

/** Notice when a scan launch returned no job: a stated refusal is named, a
 *  missing one is a failure. */
export function scanRefusalNotice(
  copy: DetailCopy,
  fallback: string,
  refusal: string | undefined,
): string {
  return refusal === undefined ? copy.actionFailed : refusalLabel(copy, fallback, refusal);
}

/** Notice after recording an outcome. An opt-out reports what it withdrew. */
export function outcomeNotice(
  copy: DetailCopy,
  outcome: string,
  result: {
    withdrawn?: { drafts: number; previews: number; mailboxDraftsNotRemoved?: number };
  },
): string {
  if (result.withdrawn !== undefined) {
    const summary = copy.optOutWithdrawn
      .replace('{drafts}', String(result.withdrawn.drafts))
      .replace('{previews}', String(result.withdrawn.previews));
    const pending = result.withdrawn.mailboxDraftsNotRemoved ?? 0;
    return pending > 0
      ? `${summary} ${copy.mailboxDeletionWarning.replace('{count}', String(pending))}`
      : summary;
  }
  return copy.outcomeSaved.replace('{outcome}', copy.outcomeLabels[outcome] ?? outcome);
}

/** Notice when a permanent delete fails: a 409 means a scan for this
 *  prospect is still active. */
export function deleteFailureNotice(copy: DetailCopy, error: unknown): string {
  return error instanceof ApiError && error.status === 409
    ? copy.deleteBlockedByJob
    : copy.actionFailed;
}

/** Issue #381: notice when archiving fails. 409: a job for the prospect is
 *  still active, nothing changed. 503: the prospect is archived but some
 *  scan files could not be removed; archiving again finishes the purge. */
export function archiveFailureNotice(copy: DetailCopy, error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return copy.archiveBlockedByJob;
  if (error instanceof ApiError && error.status === 503) return copy.archiveCleanupIncomplete;
  return copy.actionFailed;
}

/** The archive confirmation: what is kept, what is permanently deleted
 *  (with counts when there is anything), and that restoring does not bring
 *  the deleted audits back. */
export function archiveConfirmDescription(
  impact: readonly string[],
  copy: Pick<
    DetailCopy,
    'archiveKeeps' | 'archiveDeletes' | 'archiveDeletesCounts' | 'archiveRestoreNote'
  >,
): string {
  const deletes =
    impact.length === 0
      ? copy.archiveDeletes
      : copy.archiveDeletesCounts.replace('{impact}', impact.join(', '));
  return `${copy.archiveKeeps} ${deletes} ${copy.archiveRestoreNote}`;
}

/** Notice when recording an outcome fails: a 409 means the server refused
 *  the transition. */
export function outcomeFailureNotice(copy: DetailCopy, error: unknown): string {
  return error instanceof ApiError && error.status === 409
    ? copy.outcomeRefused
    : copy.actionFailed;
}

/** A scan's age as natural words ("aujourd'hui", "il y a 1 jour",
 *  "il y a 3 jours") rather than "il y a 0 jour(s)" (issue #396). */
export function scanAgeLabel(days: number, copy: DetailCopy): string {
  if (days <= 0) return copy.scanAgeToday;
  if (days === 1) return copy.scanAgeOneDay;
  return copy.scanAgeDays.replace('{days}', String(days));
}
