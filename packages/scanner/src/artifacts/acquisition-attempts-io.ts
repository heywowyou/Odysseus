/**
 * Persistence for Plan 059 check attempts that do not belong to one page.
 *
 * Page attempts live on each page's scan.json, next to the evidence they
 * describe. Site-level attempts (robots-independent origin fetches, the
 * consent probe, CrUX) have no page, so they are appended here. Appended, not
 * rewritten: a resumed run re-acquires site checks, and the earlier run's
 * attempts are part of the lineage the raw evidence snapshot must cover.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import type { AcquisitionAttemptRecord } from '../check-attempt-ledger.js';
import { readPageScanJson } from './page-scan-io.js';

const SITE_ATTEMPTS_FILENAME = 'site-acquisition-attempts.json';

function siteAttemptsPath(auditDir: string): string {
  return path.join(auditDir, 'evidence', SITE_ATTEMPTS_FILENAME);
}

function readSiteAcquisitionAttempts(auditDir: string): AcquisitionAttemptRecord[] {
  const filePath = siteAttemptsPath(auditDir);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as AcquisitionAttemptRecord[];
}

export function appendSiteAcquisitionAttempts(
  auditDir: string,
  records: readonly AcquisitionAttemptRecord[],
): void {
  if (records.length === 0) return;
  const filePath = siteAttemptsPath(auditDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = [...readSiteAcquisitionAttempts(auditDir), ...records];
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

/**
 * Every attempt of one audit: the site file plus each scanned page's
 * persisted records. A scanned page whose scan.json is missing or unreadable
 * contributes nothing, which the coverage ledger then reports as a page with
 * no attempts rather than this reader inventing any.
 */
export function collectAcquisitionAttempts(
  auditDir: string,
  scannedUrls: readonly string[],
): AcquisitionAttemptRecord[] {
  const pagesDir = path.join(auditDir, 'pages');
  const records = [...readSiteAcquisitionAttempts(auditDir)];
  for (const url of scannedUrls) {
    records.push(...(readPageScanJson(pagesDir, url)?.acquisitionAttempts ?? []));
  }
  return records;
}
