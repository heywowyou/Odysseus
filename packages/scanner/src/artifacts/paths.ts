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

/** Reverses buildAuditTimestampDir. Issue #63: `normalize <dir>` is handed
 *  an audit directory whose name already encodes this timestamp (it is the
 *  directory's own last path segment), and needs it back as a Date to
 *  build the matching bucket key - without re-reading manifest.json first,
 *  since that read is exactly the one that might need the bucket
 *  fallback. Throws on anything that isn't the exact format this package
 *  itself produces, rather than guessing. */
export function parseAuditTimestampDir(dirName: string): Date {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(dirName);
  if (!match) {
    throw new Error(`"${dirName}" is not a valid audit timestamp directory name`);
  }
  const [, datePart, hh, mm, ss] = match;
  const date = new Date(`${datePart}T${hh}:${mm}:${ss}Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`"${dirName}" is not a valid audit timestamp directory name`);
  }
  return date;
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

/** Defensive shape check before a hostname is joined into a filesystem path
 *  or a bucket key: a host with no alphanumeric character ('..' parsed out
 *  of 'http://..') must never reach path.join or fs.rm. The URL validator in
 *  core gates the boundary; this throws so a future caller that skips the
 *  validator fails loudly instead of silently building a surprising path. */
function requirePlausibleHostname(hostname: string): void {
  if (!/[a-zA-Z0-9]/.test(hostname)) {
    throw new Error(`hostname "${hostname}" contains no alphanumeric character`);
  }
}

export function buildAuditDir(artifactsRoot: string, hostname: string, startedAt: Date): string {
  requirePlausibleHostname(hostname);
  return path.join(artifactsRoot, hostname, buildAuditTimestampDir(startedAt));
}

/** Object-storage key for a file inside an audit directory, mirroring the
 *  same `<hostname>/<ISO-timestamp>/<relative path>` shape buildAuditDir
 *  uses on disk (issue #63) - so a bucket key and a local path always
 *  agree on where a given artifact lives, just under a different root.
 *  Forward slashes always, since a bucket key is not a filesystem path
 *  even when built on Windows. */
export function buildArtifactBucketKey(
  hostname: string,
  startedAt: Date,
  relativePath: string,
): string {
  requirePlausibleHostname(hostname);
  return [hostname, buildAuditTimestampDir(startedAt), relativePath.split(path.sep).join('/')].join(
    '/',
  );
}
