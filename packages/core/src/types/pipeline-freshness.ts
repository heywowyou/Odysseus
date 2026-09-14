/**
 * Explicit freshness for a versioned hotel-prospecting pipeline stage
 * (qualification, prescan, score - issue #217). A stage's stored artifact
 * always names the version it was computed at; freshness is the answer to
 * "does that version match the pipeline's current version", not "does a
 * record exist at all". A hub that only asked the second question could
 * show an old generation's verdict as if it were still authoritative.
 */
export type PipelineFreshness =
  | { state: 'missing' }
  | { state: 'current'; version: string; computedAt: Date }
  | { state: 'stale'; version: string; currentVersion: string; computedAt: Date }
  | { state: 'refreshing'; jobId: string };
