/**
 * Plan 059 step 22: the acquisition lease of an audit directory.
 *
 * A full audit's directory is keyed by the job's stable run identity, so a
 * job that is requeued while its first worker is still alive (a rolling
 * deploy, a heartbeat that went stale under load) sends a second worker to
 * the same directory. The worker that holds the job's current claim writes
 * its claim id here before any acquisition; every evidence write checks the
 * file first, so the superseded worker stops at its next write instead of
 * overwriting evidence the current one may already have accepted.
 *
 * Sync temp-file writes plus a same-volume rename, per the convention in
 * page-scan-io.ts.
 */
import * as fs from 'node:fs';
import path from 'node:path';

const ACQUISITION_LEASE_FILENAME = 'acquisition-lease.json';

interface AcquisitionLease {
  leaseId: string;
  acquiredAt: string;
}

/** Thrown by a worker that no longer holds its audit's lease. The job queue
 *  treats it as a handover, not a failure: the job belongs to another worker. */
export class StaleAcquisitionLeaseError extends Error {
  constructor(auditDir: string) {
    super(`acquisition lease for ${auditDir} is held by another worker`);
    this.name = 'StaleAcquisitionLeaseError';
  }
}

export function writeAcquisitionLease(auditDir: string, leaseId: string, now = new Date()): void {
  const target = path.join(auditDir, ACQUISITION_LEASE_FILENAME);
  const temp = path.join(auditDir, `.${ACQUISITION_LEASE_FILENAME}.tmp-${process.pid}`);
  const lease: AcquisitionLease = { leaseId, acquiredAt: now.toISOString() };
  fs.writeFileSync(temp, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, target);
}

/** Throws unless the directory's lease names this worker. A missing or
 *  unreadable lease is stale too: the holder writes it before any other file. */
export function assertAcquisitionLease(auditDir: string, leaseId: string): void {
  let held: unknown;
  try {
    held = JSON.parse(fs.readFileSync(path.join(auditDir, ACQUISITION_LEASE_FILENAME), 'utf8'));
  } catch {
    throw new StaleAcquisitionLeaseError(auditDir);
  }
  if ((held as Partial<AcquisitionLease> | null)?.leaseId !== leaseId) {
    throw new StaleAcquisitionLeaseError(auditDir);
  }
}
