/**
 * Read helpers over the `audits` and `findings` collections, for the
 * interface's audit detail view. Centralized here for the same reason
 * jobs.ts and severity-rollup.ts are: one place owns the query shape
 * rather than scattering Mongoose queries into the interface package.
 */

import type { Connection } from 'mongoose';
import {
  isValidSiren,
  normalizeDeclaredWebsite,
  type AuditHotelLink,
  type AuditManualFields,
  type Grade,
  type GradeOverride,
} from '@odysseus/core';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createFindingModel, type FindingDocument } from './schemas/finding.schema.js';
import {
  getHotelCandidate,
  getLatestHotelCandidateByOwnRegistrableDomain,
} from './hotel-candidates.js';
import type { HotelCandidateDocument } from './schemas/hotel-candidate.schema.js';

export async function getAudit(
  connection: Connection,
  auditId: string,
): Promise<AuditDocument | null> {
  const AuditModel = createAuditModel(connection);
  return AuditModel.findOne({ auditId }).lean<AuditDocument>();
}

export async function getAuditManualFields(
  connection: Connection,
  auditId: string,
): Promise<AuditManualFields | undefined> {
  const AuditModel = createAuditModel(connection);
  const audit = await AuditModel.findOne({ auditId }, { manualFields: 1 }).lean<
    Pick<AuditDocument, 'manualFields'>
  >();
  return audit?.manualFields;
}

/** Scalar fields the write and lookup handlers need: existence checks, the
 *  audit directory inputs (siteUrl, startedAt), and the findings provenance
 *  the approval flow compares against. Avoids deserializing the full
 *  manifest pages array (audit.schema.ts) four times per operator action.
 *  `_id: 0` keeps the returned object exactly this shape, no stray key. */
export type AuditRuntimeFields = Pick<
  AuditDocument,
  'auditId' | 'siteUrl' | 'startedAt' | 'findingsProvenance'
>;

export async function getAuditRuntimeFields(
  connection: Connection,
  auditId: string,
): Promise<AuditRuntimeFields | null> {
  const AuditModel = createAuditModel(connection);
  return AuditModel.findOne(
    { auditId },
    { _id: 0, auditId: 1, siteUrl: 1, startedAt: 1, findingsProvenance: 1 },
  ).lean<AuditRuntimeFields | null>();
}

/** Issue: operator-reviewed overall grade override. Same read shape as
 *  getAuditManualFields above - undefined for every audit until the
 *  operator saves one. */
export async function getAuditGradeOverride(
  connection: Connection,
  auditId: string,
): Promise<GradeOverride | undefined> {
  const AuditModel = createAuditModel(connection);
  const audit = await AuditModel.findOne({ auditId }, { gradeOverride: 1 }).lean<
    Pick<AuditDocument, 'gradeOverride'>
  >();
  return audit?.gradeOverride;
}

/** Sets or replaces the operator's grade override, always stamping a fresh
 *  reviewedAt/reviewedBy - unlike setAuditManualFields, this has no
 *  per-field merge semantics because the override is a single reviewed
 *  decision (one grade, one reason), not a bag of independent fields. */
export async function setAuditGradeOverride(
  connection: Connection,
  auditId: string,
  input: { grade: Grade; reason: string },
): Promise<GradeOverride> {
  const AuditModel = createAuditModel(connection);
  const gradeOverride: GradeOverride = {
    grade: input.grade,
    reason: input.reason,
    reviewedAt: new Date(),
    reviewedBy: 'operator',
  };

  const updated = await AuditModel.findOneAndUpdate(
    { auditId },
    { $set: { gradeOverride } },
    { new: true, projection: { gradeOverride: 1 } },
  ).lean<Pick<AuditDocument, 'gradeOverride'>>();

  if (!updated?.gradeOverride) {
    throw new Error(`odysseus: audit ${auditId} not found`);
  }
  return updated.gradeOverride;
}

/** Removes the operator's grade override, reverting the audit to its
 *  automatic grade - never persisted as a "no override" record, just
 *  absent, same convention as every other DB-only field. */
export async function clearAuditGradeOverride(
  connection: Connection,
  auditId: string,
): Promise<void> {
  const AuditModel = createAuditModel(connection);
  const result = await AuditModel.updateOne({ auditId }, { $unset: { gradeOverride: '' } });
  if (result.matchedCount === 0) {
    throw new Error(`odysseus: audit ${auditId} not found`);
  }
}

/** Merge semantics: only the keys present in `partial` are touched, every
 *  other previously saved field survives untouched - the operator edits
 *  one field at a time from the audit detail panel, not the whole
 *  document. `updatedAt` is always server-stamped on every call,
 *  regardless of which fields changed. Throws on an invalid SIREN
 *  checksum rather than persisting one, same fail-fast boundary rule
 *  routes/scans.ts already applies to the pre-scan siren option. */
export async function setAuditManualFields(
  connection: Connection,
  auditId: string,
  partial: Omit<AuditManualFields, 'updatedAt'>,
): Promise<AuditManualFields> {
  if (partial.siren !== undefined && !isValidSiren(partial.siren.value)) {
    throw new Error('odysseus: siren must be a valid SIREN (9 digits, passing the INSEE checksum)');
  }

  const AuditModel = createAuditModel(connection);
  const setFields: Record<string, unknown> = { 'manualFields.updatedAt': new Date() };
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) setFields[`manualFields.${key}`] = value;
  }

  const updated = await AuditModel.findOneAndUpdate(
    { auditId },
    { $set: setFields },
    { new: true, projection: { manualFields: 1 } },
  ).lean<Pick<AuditDocument, 'manualFields'>>();

  if (!updated?.manualFields) {
    throw new Error(`odysseus: audit ${auditId} not found`);
  }
  return updated.manualFields;
}

/** 2026-08-22, La Corniche report review: unlike `setAuditManualFields`,
 *  which always overwrites whichever keys are present in `partial` (the
 *  right behaviour for an operator explicitly editing a field), this
 *  fills in a value only when the audit's stored `manualFields` does not
 *  already have that key set - so a detected value can never clobber an
 *  operator's own entry, no matter which one is written second. Reads the
 *  current document first for that reason, rather than trying to express
 *  "set only if absent" as a single Mongo update operator (the field path
 *  is only known at call time, so `$setOnInsert` does not apply here -
 *  this is a field-level default within an existing document, not a
 *  document-level upsert).
 *
 *  Every written field gets `provenance: 'detected'`, the report's own
 *  existing signal (accessibility-statement.ts already branches on it
 *  for `declarationContactEmail`) for "the tool found this, not a human" -
 *  never `'operator'`, which is reserved for a value a person actually
 *  typed into the dashboard form. Returns the fields that were actually
 *  written (a subset of `candidates`, possibly empty), not the whole
 *  document, so a caller can log or test exactly what changed. */
export async function prefillAuditManualFields(
  connection: Connection,
  auditId: string,
  candidates: Partial<Record<keyof Omit<AuditManualFields, 'updatedAt'>, string>>,
): Promise<Partial<Record<keyof Omit<AuditManualFields, 'updatedAt'>, string>>> {
  const existing = await getAuditManualFields(connection, auditId);
  const toWrite: Partial<Record<keyof Omit<AuditManualFields, 'updatedAt'>, string>> = {};

  for (const [key, value] of Object.entries(candidates)) {
    if (value === undefined) continue;
    const fieldKey = key as keyof Omit<AuditManualFields, 'updatedAt'>;
    if (existing?.[fieldKey] !== undefined) continue; // never overwrite an already-set field, detected or operator
    toWrite[fieldKey] = value;
  }

  if (Object.keys(toWrite).length === 0) return toWrite;

  const provenancedPartial = Object.fromEntries(
    Object.entries(toWrite).map(([key, value]) => [
      key,
      { value, provenance: 'detected' as const },
    ]),
  ) as Omit<AuditManualFields, 'updatedAt'>;

  await setAuditManualFields(connection, auditId, provenancedPartial);
  return toWrite;
}

/** Plan 045 slice 1.5: like `prefillAuditManualFields` above, but for a
 *  source that can improve on its own earlier guess - a linked audit's
 *  catalogue name is better evidence than the scan's own detector, and an
 *  existing stuck audit relinked by the plan 045 backfill should pick up
 *  the better suggestion rather than keep whatever the detector wrote the
 *  first time. Overwrites a field only when it is currently absent or
 *  still carries provenance 'detected'; a field the operator has
 *  confirmed is never touched, exactly like prefillAuditManualFields.
 *  Every written field is stamped provenance 'detected' - this replaces
 *  one detector's guess with a better one, it never counts as the
 *  operator's own confirmation. Returns the fields that were actually
 *  written (a subset of `candidates`, possibly empty). */
export async function replaceDetectedManualFields(
  connection: Connection,
  auditId: string,
  candidates: Partial<Record<keyof Omit<AuditManualFields, 'updatedAt'>, string>>,
): Promise<Partial<Record<keyof Omit<AuditManualFields, 'updatedAt'>, string>>> {
  const existing = await getAuditManualFields(connection, auditId);
  const toWrite: Partial<Record<keyof Omit<AuditManualFields, 'updatedAt'>, string>> = {};

  for (const [key, value] of Object.entries(candidates)) {
    if (value === undefined) continue;
    const fieldKey = key as keyof Omit<AuditManualFields, 'updatedAt'>;
    // Cast: every field this function is meant for (nomCommercial,
    // raisonSociale, ...) is a ProvenancedField and carries `provenance`;
    // transactionalFlowOverride is the one AuditManualFields key that
    // does not, and is never passed here since candidates' values are
    // always string.
    const existingField = existing?.[fieldKey] as { provenance?: string } | undefined;
    if (existingField?.provenance === 'operator') continue;
    toWrite[fieldKey] = value;
  }

  if (Object.keys(toWrite).length === 0) return toWrite;

  const provenancedPartial = Object.fromEntries(
    Object.entries(toWrite).map(([key, value]) => [
      key,
      { value, provenance: 'detected' as const },
    ]),
  ) as Omit<AuditManualFields, 'updatedAt'>;

  await setAuditManualFields(connection, auditId, provenancedPartial);
  return toWrite;
}

export interface AuditHotelLinkResult {
  /** The candidate this audit is associated with - either the one an
   *  earlier call already linked or stamped via prospecting provenance
   *  (outreach), or the one this call just matched by domain. Null when
   *  the audit's site never matched a catalogue candidate's own domain
   *  and carries no prior association. */
  candidate: HotelCandidateDocument | null;
}

/** Resolves and, on a fresh match, stores the catalogue hotel an ordinary
 *  audit's site belongs to. Idempotent and safe to call repeatedly on the
 *  same audit (the queue-startup backfill does exactly that): writes
 *  `hotelLink` only the first time, and every later call (including this
 *  one, once written) returns the same candidate without touching the
 *  document again.
 *
 *  Never overwrites an existing association. An audit already carrying
 *  `outreach` (the immutable prospecting-provenance stamp, plan 037) is
 *  already linked to its candidate by a stronger fact than a domain
 *  match, so that candidate is returned and `hotelLink` is left unset -
 *  writing it would just be a second, weaker pointer to the same hotel.
 *  An audit already carrying `hotelLink` from a previous call is treated
 *  the same way.
 *
 *  Domain matching reuses `normalizeDeclaredWebsite` and
 *  `getLatestHotelCandidateByOwnRegistrableDomain`, the same pair
 *  analysis-stage.ts's writing-context enrichment already uses:
 *  `ownRegistrableDomain` is set on a candidate only when its domain has
 *  exactly one holder in the catalogue (trade-off 33), so a group member
 *  or vendor-hosted domain never matches here either. */
export async function linkAuditToHotelByDomain(
  connection: Connection,
  auditId: string,
  siteUrl: string,
): Promise<AuditHotelLinkResult> {
  const AuditModel = createAuditModel(connection);
  const existing = await AuditModel.findOne(
    { auditId },
    { _id: 0, outreach: 1, hotelLink: 1 },
  ).lean<Pick<AuditDocument, 'outreach' | 'hotelLink'> | null>();

  if (!existing) {
    throw new Error(`odysseus: audit ${auditId} not found`);
  }

  const existingCandidateId = existing.outreach?.candidateId ?? existing.hotelLink?.candidateId;
  if (existingCandidateId !== undefined) {
    return { candidate: await getHotelCandidate(connection, existingCandidateId) };
  }

  const normalized = normalizeDeclaredWebsite(siteUrl);
  if (normalized.kind !== 'own-domain') return { candidate: null };

  const candidate = await getLatestHotelCandidateByOwnRegistrableDomain(
    connection,
    normalized.registrableDomain,
  );
  if (!candidate) return { candidate: null };

  const hotelLink: AuditHotelLink = {
    candidateId: candidate.candidateId,
    matchedOn: 'own-registrable-domain',
    linkedAt: new Date(),
  };
  await AuditModel.updateOne({ auditId }, { $set: { hotelLink } });
  return { candidate };
}

export async function getFindingsForAudit(
  connection: Connection,
  auditId: string,
): Promise<FindingDocument[]> {
  const FindingModel = createFindingModel(connection);
  return FindingModel.find({ auditId }).lean<FindingDocument[]>();
}
