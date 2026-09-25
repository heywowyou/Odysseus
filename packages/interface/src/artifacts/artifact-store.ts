/**
 * The `ArtifactStore` port, issue #63.
 *
 * The artifact directory and rendered PDFs a job writes are local to
 * whichever machine ran it. Each machine now has its own database (the VPS
 * `test`, the workstation `odysseus-local`), but a fresh deploy or a moved
 * volume still leaves a database row with no local file to serve, and rows
 * from when the database was shared can name another machine's files. This port is what a caller writes an artifact
 * through and reads one back through when the local disk alone cannot
 * answer - the bucket is a fallback and a sync target, never the primary
 * copy `resolveArtifactFile` reads from first.
 *
 * Issue #384 added listing and deletion: deleting an audit to reclaim
 * storage has to remove the bucket copy too, not only the local directory
 * and the database rows. Callers delete one audit's objects through
 * `deleteAuditArtifacts` (delete-audit-artifacts.ts), which scopes the
 * listing to that audit's own `<hostname>/<timestamp>/` prefix, never
 * through ad-hoc provider calls.
 */

export interface ArtifactStore {
  get(key: string): Promise<Buffer | null>;
  put(key: string, bytes: Buffer): Promise<void>;
  /** Every key starting with `prefix`, in provider order. An empty result is
   *  not an error. */
  list(prefix: string): Promise<string[]>;
  /** Deleting a key that does not exist succeeds, so a retried cleanup is
   *  idempotent. A provider failure throws. */
  delete(key: string): Promise<void>;
}
