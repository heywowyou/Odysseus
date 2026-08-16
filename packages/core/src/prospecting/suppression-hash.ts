/**
 * Shared normalization + hashing for the suppression collection, used by
 * both the write path (recording an opt-out) and the read path (checking
 * one at qualification time) so the two can never disagree about
 * normalization - the same rationale ../urls.ts's LEGAL_PATH_PATTERN doc
 * comment gives for being shared rather than duplicated.
 */

import { createHash } from 'node:crypto';

export function normalizeDomainForHash(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export function normalizeAddressForHash(address: string): string {
  return address.trim().toLowerCase();
}

export function hashSuppressionValue(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}
