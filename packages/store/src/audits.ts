/**
 * Read helpers over the `audits` and `findings` collections, for the
 * interface's audit detail view. Centralized here for the same reason
 * jobs.ts and severity-rollup.ts are: one place owns the query shape
 * rather than scattering Mongoose queries into the interface package.
 */

import type { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  isValidSiren,
  type AuditManualFields,
  type Grade,
  type GradeOverride,
} from '@odysseus/core';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createJobModel } from './schemas/job.schema.js';
import { createFindingModel, type FindingDocument } from './schemas/finding.schema.js';
import {
  advanceProspectStatus,
  appendProspectEvent,
  fillMissingProspectIdentity,
  getProspectHub,
  updateProspect,
} from './prospect-hub.js';
import {
  auditIdentityFromProspect,
  confirmedIdentityFromManualFields,
  type AuditIdentityValues,
} from './prospect-identity.js';
import {
  effectiveAuditScanIntent,
  isOutreachQualifyingAudit,
  type AuditIntentSourceJob,
} from './prospect-audit-qualification.js';

/** The audit manual fields a linked prospect owns (plan 057). */
const IDENTITY_FIELDS = ['nomCommercial', 'raisonSociale', 'siren'] as const;

export async function getAudit(
  connection: Connection,
  auditId: string,
): Promise<AuditDocument | null> {
  const AuditModel = createAuditModel(connection);
  return AuditModel.findOne({ auditId }).lean<AuditDocument>();
}

export interface FullAuditEstimateSource {
  pageCount: number;
  sampledSurfacePageCount: number;
  lighthousePageCount: number;
}

/** Small pre-launch projection from the latest full audit for an exact host.
 *  Mongo computes counts from manifest metadata, so the route never loads a
 *  page's findings or raw scan artifact to show a rough duration. */
export async function getLatestFullAuditEstimateSource(
  connection: Connection,
  hostname: string,
): Promise<FullAuditEstimateSource | undefined> {
  const escapedHost = hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sitePattern = new RegExp(`^https?://${escapedHost}(?::\\d+)?(?:/|$)`, 'i');
  const rows = await createAuditModel(connection).aggregate<FullAuditEstimateSource>([
    { $match: { kind: 'audit', scanIntent: { $ne: 'quick-check' }, siteUrl: sitePattern } },
    { $sort: { startedAt: -1 } },
    { $limit: 1 },
    {
      $project: {
        _id: 0,
        pageCount: { $size: { $ifNull: ['$pages', []] } },
        sampledSurfacePageCount: {
          $size: {
            $filter: {
              input: { $ifNull: ['$pages', []] },
              as: 'page',
              cond: { $eq: ['$$page.analysisCoverage.surfaceSample.selected', true] },
            },
          },
        },
        lighthousePageCount: {
          $size: {
            $filter: {
              input: { $ifNull: ['$pages', []] },
              as: 'page',
              cond: {
                $in: [
                  '$$page.analysisCoverage.passes.lighthouse.outcome',
                  ['completed', 'partial', 'failed'],
                ],
              },
            },
          },
        },
      },
    },
  ]);
  const source = rows[0];
  return source === undefined || source.pageCount <= 0 ? undefined : source;
}

/** Issue #384: the storage identity of every stored audit (the hostname
 *  and startedAt its artifact directory and bucket prefix derive from), so
 *  orphan reconciliation can prove a bucket prefix still has an owner. */
export async function listAuditStorageIdentities(
  connection: Connection,
): Promise<{ siteUrl: string; startedAt: Date }[]> {
  return createAuditModel(connection)
    .find({})
    .select({ siteUrl: 1, startedAt: 1, _id: 0 })
    .lean<{ siteUrl: string; startedAt: Date }[]>();
}

export async function attachAuditToProspect(
  connection: Connection,
  auditId: string,
  prospectId: string | null,
  actor = 'operator',
): Promise<AuditDocument | null> {
  if (prospectId !== null && (await getProspectHub(connection, prospectId)) === null) return null;
  const AuditModel = createAuditModel(connection);
  const current = await AuditModel.findOne({ auditId }).lean<AuditDocument>();
  if (current === null) return null;
  if (
    current.prospectId === prospectId ||
    (current.prospectId === undefined && prospectId === null)
  )
    return current;
  const now = new Date();
  let manualFieldsAfterClear = current.manualFields;
  if (current.prospectId !== undefined) {
    // Plan 057: the previous prospect owned these values; they must neither stay on the audit nor seed the new prospect.
    const previous = await getProspectHub(connection, current.prospectId);
    if (previous !== null && current.manualFields !== undefined) {
      const owned = auditIdentityFromProspect(previous).confirmed;
      const cleared = IDENTITY_FIELDS.filter(
        (field) =>
          owned[field] !== undefined && current.manualFields?.[field]?.value === owned[field],
      );
      if (cleared.length > 0) {
        await AuditModel.updateOne(
          { auditId },
          {
            $unset: Object.fromEntries(cleared.map((field) => [`manualFields.${field}`, ''])),
            $set: { 'manualFields.updatedAt': now },
          },
        );
        const remaining = { ...current.manualFields };
        for (const field of cleared) delete remaining[field];
        manualFieldsAfterClear = remaining;
      }
    }
  }
  const update = prospectId === null ? { $unset: { prospectId: '' } } : { $set: { prospectId } };
  await AuditModel.updateOne({ auditId }, update);
  if (current.prospectId !== undefined) {
    await appendProspectEvent(connection, {
      eventId: randomUUID(),
      prospectId: current.prospectId,
      type: 'scan-detached',
      payload: { auditId },
      actor,
      at: now,
    });
  }
  if (prospectId !== null) {
    await appendProspectEvent(connection, {
      eventId: randomUUID(),
      prospectId,
      type: 'scan-attached',
      payload: { auditId },
      actor,
      at: now,
    });
    const jobs = await createJobModel(connection)
      .find({ $or: [{ auditId }, { auditIds: auditId }] })
      .select({ _id: 0, type: 1, auditId: 1, auditIds: 1, 'options.scanType': 1 })
      .lean<AuditIntentSourceJob[]>();
    const scanIntent = effectiveAuditScanIntent(current, jobs);
    if (isOutreachQualifyingAudit({ ...current, ...(scanIntent ? { scanIntent } : {}) })) {
      await advanceProspectStatus(connection, prospectId, 'audited');
    }
    // Issue #289: the audit being attached may already know part of the
    // prospect's identity - the scan's checksum-validated SIREN from the
    // mentions légales, and any identity field the operator confirmed on
    // the audit (plan 045). Fill only the fields the prospect is missing;
    // a manual value is never overwritten here.
    await fillMissingProspectIdentity(
      connection,
      prospectId,
      {
        siren: current.siteSignals?.siren,
        ...confirmedIdentityFromManualFields(manualFieldsAfterClear),
      },
      actor,
    );
    // Issue #379: and the other direction - identity the operator typed on
    // the prospect is confirmed identity for the attached audit.
    await syncProspectIdentityIntoAudit(connection, auditId, prospectId);
  }
  return { ...current, ...(prospectId === null ? {} : { prospectId }) };
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
  'auditId' | 'siteUrl' | 'startedAt' | 'findingsProvenance' | 'prospectId'
>;

export async function getAuditRuntimeFields(
  connection: Connection,
  auditId: string,
): Promise<AuditRuntimeFields | null> {
  const AuditModel = createAuditModel(connection);
  return AuditModel.findOne(
    { auditId },
    { _id: 0, auditId: 1, siteUrl: 1, startedAt: 1, findingsProvenance: 1, prospectId: 1 },
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

/**
 * Issue #379: writes the operator-confirmed prospect identity onto the
 * audit with provenance 'operator', so the report's identity gate accepts
 * it without a second confirmation. Deliberately not
 * replaceDetectedManualFields, which stamps everything it writes as
 * 'detected'. For a linked audit the prospect is the single source of these
 * three fields (operator decision 2026-09-17, plan 057), so a confirmed
 * prospect value replaces whatever the audit holds, including a value typed
 * on the audit; a correction on the prospect therefore always reaches it.
 * Fields the prospect has not confirmed are left alone. Returns the fields
 * written.
 */
export async function applyConfirmedProspectIdentity(
  connection: Connection,
  auditId: string,
  confirmed: AuditIdentityValues,
): Promise<AuditIdentityValues> {
  const existing = await getAuditManualFields(connection, auditId);
  const toWrite: Partial<Omit<AuditManualFields, 'updatedAt'>> = {};
  const written: AuditIdentityValues = {};
  for (const field of IDENTITY_FIELDS) {
    const value = confirmed[field];
    if (value === undefined) continue;
    if (existing?.[field]?.provenance === 'operator' && existing[field]?.value === value) continue;
    toWrite[field] = { value, provenance: 'operator' };
    written[field] = value;
  }
  if (Object.keys(toWrite).length > 0) await setAuditManualFields(connection, auditId, toWrite);
  return written;
}

/**
 * Issue #379: the one resolver every stage that consumes an audit's identity
 * runs first - the scan's audit stage, report production and regeneration,
 * and attaching an audit to a prospect - so none of them can fall back to a
 * detected guess the operator already answered on the prospect. Returns the
 * prospect's split identity (the suggestions feed the audit stage's
 * detected prefill), or undefined for an audit with no linked prospect.
 */
export async function syncProspectIdentityIntoAudit(
  connection: Connection,
  auditId: string,
  prospectId?: string,
): Promise<ReturnType<typeof auditIdentityFromProspect> | undefined> {
  const linkedProspectId =
    prospectId ??
    (
      await createAuditModel(connection)
        .findOne({ auditId }, { prospectId: 1 })
        .lean<Pick<AuditDocument, 'prospectId'>>()
    )?.prospectId;
  if (linkedProspectId === undefined) return undefined;
  const prospect = await getProspectHub(connection, linkedProspectId);
  if (prospect === null) return undefined;
  const identity = auditIdentityFromProspect(prospect);
  await applyConfirmedProspectIdentity(connection, auditId, identity.confirmed);
  return identity;
}

/** Plan 057: for an audit linked to a prospect, the prospect owns the
 *  trading name, legal name and SIREN. An edit made on the audit is saved
 *  on the prospect (origin 'operator', so it applies to every audit of that
 *  prospect) and then synced back onto this audit. */
export async function saveLinkedAuditIdentity(
  connection: Connection,
  auditId: string,
  prospectId: string,
  values: AuditIdentityValues,
  actor = 'operator',
): Promise<AuditManualFields | undefined> {
  const patch: Record<string, string> = {};
  if (values.nomCommercial !== undefined) patch['tradingName'] = values.nomCommercial;
  if (values.raisonSociale !== undefined) patch['legalName'] = values.raisonSociale;
  if (values.siren !== undefined) patch['siren'] = values.siren;
  const updated = await updateProspect(connection, prospectId, patch, actor);
  if (updated === null) throw new Error('odysseus: the linked prospect no longer exists');
  await syncProspectIdentityIntoAudit(connection, auditId, prospectId);
  return getAuditManualFields(connection, auditId);
}

export async function getFindingsForAudit(
  connection: Connection,
  auditId: string,
): Promise<FindingDocument[]> {
  const FindingModel = createFindingModel(connection);
  return FindingModel.find({ auditId }).lean<FindingDocument[]>();
}
