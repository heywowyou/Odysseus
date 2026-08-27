/**
 * Artifact directory layout:
 *
 *   artifacts/
 *     <hostname>/
 *       <ISO-8601-UTC-timestamp>/
 *         manifest.json
 *         findings.json
 *         pages/
 *           <slug>-<6-char-url-hash>/
 *             raw.png
 *             rendered.png
 *             scan.json
 *
 * Hostname is kept verbatim (www.example.com and example.com are
 * different origins). The timestamp has colons replaced with hyphens
 * (illegal on Windows, awkward in shells) so lexicographic order equals
 * chronological order. The URL hash is always appended, not only on
 * collision: without it, /services/audit and /services-audit slug
 * identically and would silently overwrite each other.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

const PAGE_HASH_LENGTH = 6;

export function buildAuditTimestampDir(date: Date): string {
  // toISOString() -> '2026-08-02T14:32:05.123Z'; strip milliseconds, then
  // swap colons for hyphens -> '2026-08-02T14-32-05Z'.
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
}

export function slugify(pathname: string): string {
  return pathname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Hashes the full URL, including query string, so two pages differing
 *  only by query string still land in distinct directories. */
export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, PAGE_HASH_LENGTH);
}

export function buildPageDir(url: string): string {
  const parsed = new URL(url);
  const slug = slugify(parsed.pathname) || 'root';
  return `${slug}-${hashUrl(url)}`;
}

export function buildAuditDir(artifactsRoot: string, hostname: string, startedAt: Date): string {
  return path.join(artifactsRoot, hostname, buildAuditTimestampDir(startedAt));
}

/** Prescan layout: `<prescansRoot>/<hostname>/<ISO-timestamp>/`, the same
 *  hostname-then-timestamp shape as an audit directory so the two are
 *  navigable the same way, under a root that keeps them distinguishable.
 *  See getPrescansRoot() for why they are not siblings of audit directories. */
export function buildPrescanDir(prescansRoot: string, hostname: string, startedAt: Date): string {
  return path.join(prescansRoot, hostname, buildAuditTimestampDir(startedAt));
}
