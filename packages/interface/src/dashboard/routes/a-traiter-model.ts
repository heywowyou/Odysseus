import type { DashboardStrings } from '../i18n/types';
import type { ScanSummary } from '../lib/api-types';
import { listStatus } from './audits-model';

/**
 * Pure model of the a-traiter page (plan 040 slice 6): everything the inbox
 * renders or links is computed here so the page component stays
 * presentational, the same split as audits-model.ts and hub-model.ts.
 */

/** Row cap of every short list on the page. The lists are doors into the
 *  hub, not workspaces; the full total lives in each list's header. */
export const A_TRAITER_ROW_LIMIT = 5;

/** The scans endpoint returns an array without a total, so the waiting-for
 *  -input count is computed over the same bounded window the Audits page
 *  reads (limit 200). Newest first, copied before sorting so the polled
 *  array is never reordered in place. */
export function needsInputScans(summaries: ScanSummary[]): ScanSummary[] {
  return summaries
    .filter((summary) => listStatus(summary) === 'needs-input')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Display name of one draft's touch, in the hub Emails section's own
 *  vocabulary (touch 1 is the first email, touch n is follow-up n-1), so
 *  the same draft never carries two names on two screens. */
export function draftTouchName(touch: number, labels: DashboardStrings['hub']['emails']): string {
  return touch <= 1 ? labels.firstEmailName : labels.followUpName.replace('{n}', String(touch - 1));
}
