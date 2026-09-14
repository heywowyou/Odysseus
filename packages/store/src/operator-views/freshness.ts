/**
 * Turns a versioned artifact's own version/timestamp into an explicit
 * PipelineFreshness (issue #217), against a current version the caller
 * supplies - the same convention planOutreachFullScan already uses for
 * qualification-version comparisons (outreach-scans.ts), so store code
 * never has to import an interface-owned "current version" constant.
 */
import type { PipelineFreshness } from '@odysseus/core';

/** The pipeline's current version at each versioned stage, supplied by the
 *  caller rather than imported here - the same convention
 *  planOutreachFullScan's OutreachFullScanVersionInputs already established,
 *  since these constants are owned by the interface package. Shared by every
 *  view that computes freshness (detail and list), so both projections
 *  compare against the same currency. */
export interface ProspectFreshnessVersions {
  qualificationVersion: string;
  prescanVersion: string;
  scoringVersion: string;
}

export interface ComputeFreshnessInput {
  version: string | undefined;
  computedAt: Date | undefined;
  currentVersion: string;
  /** A job already refreshing this stage for this candidate, if any -
   *  takes priority over the stored artifact's own currency. */
  refreshingJobId?: string | null | undefined;
}

export function computeFreshness(input: ComputeFreshnessInput): PipelineFreshness {
  if (input.refreshingJobId != null) return { state: 'refreshing', jobId: input.refreshingJobId };
  if (input.version === undefined || input.computedAt === undefined) return { state: 'missing' };
  if (input.version === input.currentVersion) {
    return { state: 'current', version: input.version, computedAt: input.computedAt };
  }
  return {
    state: 'stale',
    version: input.version,
    currentVersion: input.currentVersion,
    computedAt: input.computedAt,
  };
}
