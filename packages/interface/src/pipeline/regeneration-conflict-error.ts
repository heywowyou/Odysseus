/** Thrown when writing regeneration cannot start: the cost confirmation is
 *  missing, a run is already in flight, or the warning acknowledgement is
 *  missing or stale. Routes map these to 409.
 *
 * Its own module so audit-evidence.ts (readAuditEvidence) and
 * regenerate-writing.ts (which throws it) don't need to import each
 * other. */
export class RegenerationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegenerationConflictError';
  }
}
