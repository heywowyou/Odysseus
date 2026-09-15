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
