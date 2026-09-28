/**
 * Persistence for Plan 059 check attempts that do not belong to one page,
 * and the reader that gathers every persisted evidence-graph input.
 *
 * Page attempts live on each page's scan.json, next to the evidence they
 * describe. Site-level attempts (robots-independent origin fetches, the
 * consent probe, CrUX) have no page, so they are appended here. Appended, not
 * rewritten: a resumed run re-acquires site checks, and the earlier run's
 * attempts are part of the lineage the raw evidence snapshot must cover.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import type { AuditScopeSnapshot } from '@odysseus/core';
import type { AcquisitionAttemptRecord } from '../check-attempt-ledger.js';
import type { EvidencePageObservation } from '../evidence-graph.js';
import type { InventoryLedgerSnapshot } from '../inventory-ledger.js';
import type { RobotsPolicyChain } from '../robots-policy-snapshot.js';
import type { StructuralAnchor, TemporalAnchorSet } from '../temporal-anchors.js';
import { readPageScanJson } from './page-scan-io.js';

const SITE_ATTEMPTS_FILENAME = 'site-acquisition-attempts.json';
const TEMPORAL_ANCHORS_FILENAME = 'temporal-anchors.json';

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

/** Persists the temporal-coherence probes. Rewritten whole: the start
 *  probes never change once taken, and the end probe is the latest one. */
export function writeTemporalAnchors(auditDir: string, anchors: TemporalAnchorSet): void {
  const filePath = path.join(auditDir, 'evidence', TEMPORAL_ANCHORS_FILENAME);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(anchors, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

/** The persisted per-audit inputs the evidence graph is assembled from. */
export interface PersistedEvidenceInputs {
  scope: AuditScopeSnapshot | undefined;
  inventory: InventoryLedgerSnapshot | undefined;
  robotsChain: RobotsPolicyChain;
  attempts: AcquisitionAttemptRecord[];
  pages: EvidencePageObservation[];
  /** The start and end probes of the temporal-coherence window. */
  temporalAnchors: TemporalAnchorSet | undefined;
  /** Each scanned page's own anchor, from its raw pass. */
  pageAnchors: StructuralAnchor[];
}

function readOptionalJson<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

/**
 * Reads what a full audit persisted for its evidence graph: the frozen scope,
 * the inventory and robots chain, every attempt (the site file plus each
 * scanned page's records) and each page's readiness and frame observations.
 * Each scan.json is read once. A scanned page whose scan.json is missing or
 * unreadable contributes nothing, which the graph then reports as a page with
 * no attempts rather than this reader inventing any.
 */
export function readPersistedEvidenceInputs(
  auditDir: string,
  scannedUrls: readonly string[],
): PersistedEvidenceInputs {
  const pagesDir = path.join(auditDir, 'pages');
  const attempts = [...readSiteAcquisitionAttempts(auditDir)];
  const pages: EvidencePageObservation[] = [];
  const pageAnchors: StructuralAnchor[] = [];
  for (const url of scannedUrls) {
    const scan = readPageScanJson(pagesDir, url);
    if (scan === undefined) continue;
    attempts.push(...(scan.acquisitionAttempts ?? []));
    pages.push({
      url,
      ...(scan.readiness !== undefined ? { readiness: scan.readiness } : {}),
      ...(scan.frames !== undefined ? { frames: scan.frames } : {}),
      ...(scan.performanceMeasurement !== undefined
        ? { performanceMeasurement: scan.performanceMeasurement }
        : {}),
      ...(scan.surfaces !== undefined ? { surfaces: scan.surfaces } : {}),
      ...(scan.plannedOutOfScopeSurfaceIds !== undefined
        ? { plannedOutOfScopeSurfaceIds: scan.plannedOutOfScopeSurfaceIds }
        : {}),
      ...(scan.hydrationSweep !== undefined ? { hydration: scan.hydrationSweep } : {}),
      // Plan 059 step 26: the page's persisted scheduling-side signals,
      // which the report-facing semantic classifier reads.
      ...(scan.auditProfile !== undefined ? { auditProfile: scan.auditProfile } : {}),
      ...(scan.keyboardNavigation !== undefined
        ? { keyboardNavigation: scan.keyboardNavigation }
        : {}),
    });
    if (scan.structuralAnchor !== undefined) pageAnchors.push(scan.structuralAnchor);
  }
  return {
    scope: readOptionalJson<AuditScopeSnapshot>(path.join(auditDir, 'audit-scope.json')),
    inventory: readOptionalJson<InventoryLedgerSnapshot>(
      path.join(auditDir, 'evidence', 'inventory-ledger.json'),
    ),
    robotsChain:
      readOptionalJson<RobotsPolicyChain>(
        path.join(auditDir, 'evidence', 'robots-policy-chain.json'),
      ) ?? [],
    attempts,
    pages,
    temporalAnchors: readOptionalJson<TemporalAnchorSet>(
      path.join(auditDir, 'evidence', TEMPORAL_ANCHORS_FILENAME),
    ),
    pageAnchors,
  };
}
