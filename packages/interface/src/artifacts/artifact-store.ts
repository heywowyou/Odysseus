/**
 * The `ArtifactStore` port, issue #63.
 *
 * A full audit's database row is shared (one Atlas cluster), but the
 * artifact directory and rendered PDFs a job writes are local to whichever
 * machine ran it. A scan or render triggered on a different machine, or
 * after a fresh deploy, has no local file to serve even though the database
 * row says the audit exists. This port is what a caller writes an artifact
 * through and reads one back through when the local disk alone cannot
 * answer - the bucket is a fallback and a sync target, never the primary
 * copy `resolveArtifactFile` reads from first.
 *
 * Two methods only, unlike `PreviewPublisher`'s three: an artifact is never
 * deleted through this port (screenshots are pruned locally by
 * `pruneScreenshots`, and nothing here mirrors that deletion into the
 * bucket - out of scope for this issue, see the plan).
 */

export interface ArtifactStore {
  get(key: string): Promise<Buffer | null>;
  put(key: string, bytes: Buffer): Promise<void>;
}
