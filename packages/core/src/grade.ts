/**
 * The deterministic letter grade type and its operator-review override
 * (issue: operator-reviewed overall grade override). Defined once here so
 * @odysseus/report (which computes the automatic grade) and @odysseus/store
 * (which persists the override on the audit document) both use the exact
 * same type rather than two copies drifting apart - the same convention
 * CLAUDE.md's shared-domain-types rule already applies to RecurrenceType.
 */

export type Grade = 'A' | 'B' | 'C' | 'D';

export const GRADES: readonly Grade[] = ['A', 'B', 'C', 'D'];

export function isGrade(value: unknown): value is Grade {
  return typeof value === 'string' && (GRADES as readonly string[]).includes(value);
}

/** A human review of the automatically computed grade, DB-only (never
 *  part of manifest.json - same convention as AuditManualFields). The
 *  automatic grade itself is never stored: it is a pure function of
 *  findings and the manifest, so it is always recomputed fresh rather
 *  than risking two copies disagreeing after findings change. */
export interface GradeOverride {
  grade: Grade;
  reason: string;
  reviewedAt: Date;
  /** Single-operator tool today: a fixed tag, not a per-user identity,
   *  matching AuditManualFields' own 'operator' provenance value. */
  reviewedBy: 'operator';
}
