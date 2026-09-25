import { createHash, randomBytes } from 'node:crypto';

const REFERENCE_AUDIT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function createReferenceAuditToken(): string {
  return randomBytes(32).toString('base64url');
}

function isValidReferenceAuditToken(token: string): boolean {
  return REFERENCE_AUDIT_TOKEN_PATTERN.test(token);
}

export function hashReferenceAuditToken(token: string): string {
  if (!isValidReferenceAuditToken(token)) throw new Error('reference audit token is malformed');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function referenceAuditTrackedUrl(publicBaseUrl: string, token: string): string {
  if (!isValidReferenceAuditToken(token)) throw new Error('reference audit token is malformed');
  return `${publicBaseUrl.replace(/\/+$/u, '')}/exemple-audit/r/${token}`;
}
