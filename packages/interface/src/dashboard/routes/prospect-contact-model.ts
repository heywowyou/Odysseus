/**
 * Pure model for the prospect contact correction controls (issues #270,
 * #271): which confirmation a removal asks for, and which request it sends.
 * The server owns the invariants (single primary website, recipient first);
 * this only builds the operator-facing wording and the call.
 */

import type { DashboardStrings } from '../i18n/types';

type ContactsCopy = DashboardStrings['prospectHub']['detail']['contacts'];

export type ContactRemoval =
  | { kind: 'website'; url: string; primary: boolean }
  | { kind: 'email'; address: string; blacklist: boolean };

export function contactRemovalConfirm(
  removal: ContactRemoval,
  copy: ContactsCopy,
): { title: string; description: string; confirmLabel: string } {
  if (removal.kind === 'website') {
    const description = copy.removeWebsiteDescription.replace('{url}', removal.url);
    return {
      title: copy.removeWebsiteTitle,
      description: removal.primary
        ? `${description} ${copy.removeWebsitePrimaryNote}`
        : description,
      confirmLabel: copy.confirmRemove,
    };
  }
  return removal.blacklist
    ? {
        title: copy.removeAndBlacklistTitle,
        description: copy.removeAndBlacklistDescription.replace('{address}', removal.address),
        confirmLabel: copy.confirmRemoveAndBlacklist,
      }
    : {
        title: copy.removeEmailTitle,
        description: copy.removeEmailDescription.replace('{address}', removal.address),
        confirmLabel: copy.confirmRemove,
      };
}

export function contactRemovalRequest(
  prospectId: string,
  removal: ContactRemoval,
): { path: string; body: Record<string, unknown> } {
  const base = `/api/prospects/${encodeURIComponent(prospectId)}`;
  return removal.kind === 'website'
    ? { path: `${base}/websites`, body: { url: removal.url } }
    : {
        path: `${base}/emails`,
        body: { address: removal.address, ...(removal.blacklist ? { suppress: true } : {}) },
      };
}

export interface ProspectStakeholder {
  name: string;
  position?: string;
}

/** The stored entry for a typed name and position, or null when the name is
 *  blank. An empty position is left out rather than stored as ''. */
export function stakeholderFromInput(name: string, position: string): ProspectStakeholder | null {
  const trimmedName = name.trim();
  if (trimmedName === '') return null;
  const trimmedPosition = position.trim();
  return trimmedPosition === ''
    ? { name: trimmedName }
    : { name: trimmedName, position: trimmedPosition };
}

/** Stakeholders have no server-side invariants, so every change sends the
 *  whole list: `index` undefined appends, `entry` null removes. */
export function stakeholdersAfterChange(
  current: readonly ProspectStakeholder[],
  index: number | undefined,
  entry: ProspectStakeholder | null,
): ProspectStakeholder[] {
  if (index === undefined) return entry === null ? [...current] : [...current, entry];
  return current.flatMap((item, position) =>
    position !== index ? [item] : entry === null ? [] : [entry],
  );
}
