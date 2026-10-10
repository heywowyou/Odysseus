import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { Prospect } from '@odysseus/core';
import type {
  DirectoryEntry,
  OutreachClosedReason,
  OutreachLostReason,
  ProspectEvent,
  ProspectStatus,
  ProspectWebsiteKind,
} from '@odysseus/core';
import {
  ACTIVE_OUTREACH_THREAD_STATES,
  hasHotelChainBrandName,
  isOutreachOutcome,
  normalizeDeclaredWebsite,
  websiteKindForResolution,
  emailDomain,
  isFreeMailDomain,
  primaryWebsite,
} from '@odysseus/core';
import { directoryEntrySchema, prospectEventSchema, prospectSchema } from '@odysseus/core';
import {
  createProspectEventModel,
  type ProspectEventDocument,
} from './schemas/prospect-event.schema.js';
import { createProspectHubModel, type ProspectHubDocument } from './schemas/prospect-hub.schema.js';
import {
  createDirectoryEntryModel,
  type DirectoryEntryDocument,
} from './schemas/directory-entry.schema.js';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import {
  createJobModel,
  JOB_STATUSES_CAN_STILL_WRITE,
  type JobRunIdentity,
} from './schemas/job.schema.js';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
import { createReportModel } from './schemas/report.schema.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';
import {
  createActiveReportBundleModel,
  createReportBundleModel,
  createReportQualityLeaseModel,
  createReportQualityRunModel,
} from './schemas/report-quality.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createReferenceAuditLinkModel } from './schemas/reference-audit-link.schema.js';
import { transitionOutreachThread } from './outreach-threads.js';
import { recordOutreachThreadOutcome } from './outreach-outcomes.js';
import { deleteAuditCascade, type AuditCascadeCounts } from './delete-audit.js';
import { addSuppressionEntry } from './suppression.js';
import {
  loadProspectWork,
  PROSPECT_WORK_PROJECTION,
  type ProspectTodoRow,
  type ProspectWorkProspect,
} from './prospect-work.js';
import { decideAutomaticStatus } from './prospect-status-policy.js';
import {
  DETECTED_IDENTITY_ORIGIN,
  missingProspectIdentityFill,
  withNormalizedSiren,
  type ProspectIdentityField,
  type ProspectIdentityValues,
} from './prospect-identity.js';

export interface NewProspectHubInput {
  sector: string;
  name: string;
  websites?: Prospect['websites'] | undefined;
  address?: string | undefined;
  postcode?: string | undefined;
  commune?: string | undefined;
  department?: string | undefined;
  phone?: string | undefined;
  emails?: Prospect['emails'] | undefined;
  siren?: string | undefined;
  siret?: string | undefined;
  tradingName?: string | undefined;
  legalName?: string | undefined;
  notes?: string | undefined;
  status?: ProspectStatus | undefined;
  hotel?: Prospect['hotel'] | undefined;
  fieldOrigins?: Prospect['fieldOrigins'] | undefined;
  directoryRef?: Prospect['directoryRef'] | undefined;
}

export interface ProspectHubFilter {
  q?: string | undefined;
  view?: ProspectListView | undefined;
  status?: ProspectStatus | undefined;
  sector?: string | undefined;
  stars?: number | undefined;
  groupStatus?: NonNullable<Prospect['hotel']>['groupStatus'] | undefined;
  websiteKind?: ProspectWebsiteKind | undefined;
  department?: string | undefined;
  commune?: string | undefined;
  roomsMin?: number | undefined;
  roomsMax?: number | undefined;
  hasScan?: boolean | undefined;
  inactive?: boolean | undefined;
  /** Plan 050: false/absent lists active prospects, true the archive. */
  archived?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface DirectoryFilter {
  q?: string | undefined;
  sector?: string | undefined;
  stars?: number | undefined;
  groupStatus?: NonNullable<Prospect['hotel']>['groupStatus'] | undefined;
  websiteKind?: ProspectWebsiteKind | undefined;
  department?: string | undefined;
  commune?: string | undefined;
  postcode?: string | undefined;
  roomsMin?: number | undefined;
  roomsMax?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface Page<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

const PROSPECT_RESULT_STATUSES = [
  'contacted',
  'follow-up',
  'replied',
  'call',
  'quoted',
  'won',
  'lost',
  'opted-out',
] as const;

export type ProspectResultStatus = (typeof PROSPECT_RESULT_STATUSES)[number];
export type ProspectListView = 'all' | 'results';

export interface ProspectListPage extends Page<ProspectHubDocument> {
  statusCounts: Record<ProspectResultStatus, number>;
  /** Archived prospects matching the search and property filters, whatever
   *  the status, so the archive tab count does not change with the view. */
  archivedCount: number;
}

/** Plan 050: archive is explicit lifecycle state, not a status. Absence of
 *  the field is the backward-compatible active state. */
const ACTIVE_PROSPECT_QUERY = { archivedAt: { $exists: false } } as const;
const ARCHIVED_PROSPECT_QUERY = { archivedAt: { $exists: true } } as const;

export type { ProspectTodoRow } from './prospect-work.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const INACTIVE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

function pageBounds(page: number | undefined, pageSize: number | undefined): [number, number] {
  const safePage = Number.isInteger(page) && page !== undefined && page > 0 ? page : 1;
  const safeSize =
    Number.isInteger(pageSize) && pageSize !== undefined && pageSize > 0
      ? Math.min(pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return [safePage, safeSize];
}

function departmentFromPostcode(postcode: string | undefined): string | undefined {
  if (!postcode) return undefined;
  const digits = postcode.replace(/\D/g, '');
  if (digits.length < 2) return undefined;
  if (digits.startsWith('20') && digits.length >= 3) return digits.startsWith('200') ? '2A' : '2B';
  return digits.slice(0, 2);
}

export const departmentFromPostcodeForTest = departmentFromPostcode;

function event(
  prospectId: string,
  type: ProspectEvent['type'],
  payload: Record<string, unknown>,
  actor: string,
): ProspectEvent {
  return { eventId: randomUUID(), prospectId, type, payload, actor, at: new Date() };
}

async function recordEvent(connection: Connection, value: ProspectEvent): Promise<void> {
  prospectEventSchema.parse(value);
  await createProspectEventModel(connection).create(value);
}

export async function appendProspectEvent(
  connection: Connection,
  value: ProspectEvent,
): Promise<void> {
  await recordEvent(connection, value);
}

function queryForProspects(filter: ProspectHubFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filter.sector) query['sector'] = filter.sector;
  if (filter.stars !== undefined) query['hotel.stars'] = filter.stars;
  if (filter.groupStatus) query['hotel.groupStatus'] = filter.groupStatus;
  if (filter.websiteKind) query['websites.kind'] = filter.websiteKind;
  if (filter.department) query['department'] = filter.department;
  if (filter.commune) query['commune'] = filter.commune;
  if (filter.roomsMin !== undefined || filter.roomsMax !== undefined) {
    query['hotel.rooms'] = {
      ...(filter.roomsMin !== undefined ? { $gte: filter.roomsMin } : {}),
      ...(filter.roomsMax !== undefined ? { $lte: filter.roomsMax } : {}),
    };
  }
  if (filter.q)
    query['$or'] = [
      { name: new RegExp(escapeRegex(filter.q), 'i') },
      { commune: new RegExp(escapeRegex(filter.q), 'i') },
    ];
  if (filter.inactive !== undefined) {
    const boundary = new Date(Date.now() - INACTIVE_AFTER_MS);
    query['lastActivityAt'] = filter.inactive ? { $lt: boundary } : { $gte: boundary };
  }
  query['archivedAt'] = (
    filter.archived === true ? ARCHIVED_PROSPECT_QUERY : ACTIVE_PROSPECT_QUERY
  )['archivedAt'];
  return query;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Fields that are not operator-entered facts and so carry no origin. */
const ORIGINLESS_CREATE_FIELDS = new Set(['fieldOrigins', 'directoryRef', 'status', 'sector']);

/** Issue #379: every field supplied at creation gets an origin, the same rule
 *  updateProspect applies to an edit. An explicit origin from the caller
 *  (a directory import's 'atout-france', a discovery path) is kept; any
 *  other supplied field was entered by the operator. Before this, a manual
 *  create stamped only the name, so a SIREN or legal name typed in the
 *  create flow carried no provenance and read as unconfirmed downstream. */
function creationFieldOrigins(input: NewProspectHubInput): Prospect['fieldOrigins'] {
  const origins: Prospect['fieldOrigins'] = {};
  for (const [key, value] of Object.entries(input)) {
    if (ORIGINLESS_CREATE_FIELDS.has(key) || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    origins[key] = 'operator';
  }
  return { ...origins, ...input.fieldOrigins };
}

export async function createProspectHub(
  connection: Connection,
  rawInput: NewProspectHubInput,
  actor = 'operator',
  prospectId: string = randomUUID(),
): Promise<ProspectHubDocument> {
  const input = withNormalizedSiren(rawInput);
  const now = new Date();
  const websites = (input.websites ?? []).map((website) => {
    const resolution = normalizeDeclaredWebsite(website.url);
    return resolution.kind === 'unusable'
      ? website
      : {
          ...website,
          registrableDomain: resolution.registrableDomain,
          kind: websiteKindForResolution(resolution),
        };
  });
  const value = prospectSchema.parse({
    prospectId,
    sector: input.sector,
    name: input.name,
    websites,
    address: input.address,
    postcode: input.postcode,
    commune: input.commune,
    department: input.department ?? departmentFromPostcode(input.postcode),
    phone: input.phone,
    emails: input.emails ?? [],
    siren: input.siren,
    siret: input.siret,
    tradingName: input.tradingName,
    legalName: input.legalName,
    notes: input.notes,
    status: input.status ?? 'new',
    hotel: input.hotel,
    fieldOrigins: creationFieldOrigins(input),
    directoryRef: input.directoryRef,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  });
  await createProspectHubModel(connection).create(value);
  await recordEvent(
    connection,
    event(
      value.prospectId,
      'prospect-created',
      {
        fields: Object.keys(input),
        origin: input.directoryRef !== undefined ? 'directory' : 'operator',
        ...(input.directoryRef !== undefined ? { source: input.directoryRef.source } : {}),
      },
      actor,
    ),
  );
  return value;
}

export async function getProspectHub(
  connection: Connection,
  prospectId: string,
): Promise<ProspectHubDocument | null> {
  return createProspectHubModel(connection).findOne({ prospectId }).lean<ProspectHubDocument>();
}

/** Display name and sales status for a set of prospect IDs, for lists that
 *  show many jobs at once (the Audits table and its scan queue). Unknown IDs
 *  are simply absent. */
export async function getProspectLabels(
  connection: Connection,
  prospectIds: readonly string[],
): Promise<Map<string, { name: string; status: ProspectStatus }>> {
  if (prospectIds.length === 0) return new Map();
  const rows = await createProspectHubModel(connection)
    .find(
      { prospectId: { $in: [...new Set(prospectIds)] } },
      { prospectId: 1, name: 1, status: 1, _id: 0 },
    )
    .lean<{ prospectId: string; name: string; status: ProspectStatus }[]>();
  return new Map(rows.map((row) => [row.prospectId, { name: row.name, status: row.status }]));
}

export async function findProspectsByDomain(
  connection: Connection,
  domain: string,
): Promise<ProspectHubDocument[]> {
  const resolution = normalizeDeclaredWebsite(domain);
  if (resolution.kind === 'unusable') return [];
  return createProspectHubModel(connection)
    .find({ 'websites.registrableDomain': resolution.registrableDomain })
    .sort({ name: 1 })
    .lean<ProspectHubDocument[]>();
}

/** Prospects carrying this address, compared case-insensitively. Used by the
 *  public opt-out flow, which only knows the address the visitor typed. */
export async function findProspectsByEmail(
  connection: Connection,
  address: string,
): Promise<ProspectHubDocument[]> {
  const normalized = address.trim();
  if (normalized === '') return [];
  return createProspectHubModel(connection)
    .find({ 'emails.address': new RegExp(`^${escapeRegex(normalized)}$`, 'iu') })
    .lean<ProspectHubDocument[]>();
}

export async function listProspects(
  connection: Connection,
  filter: ProspectHubFilter = {},
): Promise<ProspectListPage> {
  const [page, pageSize] = pageBounds(filter.page, filter.pageSize);
  const query = queryForProspects(filter);
  if (filter.hasScan !== undefined) {
    const scannedProspectIds = await createAuditModel(connection).distinct<string>('prospectId', {
      prospectId: { $exists: true },
    });
    query['prospectId'] = filter.hasScan
      ? { $in: scannedProspectIds }
      : { $nin: scannedProspectIds };
  }
  if (filter.view === 'results') {
    query['status'] = filter.status
      ? PROSPECT_RESULT_STATUSES.includes(filter.status as ProspectResultStatus)
        ? filter.status
        : { $in: [] }
      : { $in: PROSPECT_RESULT_STATUSES };
  } else if (filter.status) {
    query['status'] = filter.status;
  }
  const Model = createProspectHubModel(connection);
  const [rows, total, statusGroups, archivedCount] = await Promise.all([
    Model.find(query)
      .sort({ name: 1, prospectId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<ProspectHubDocument[]>(),
    Model.countDocuments(query),
    // One pass for every status count. The filter holds only plain values,
    // regular expressions and dates, which an aggregation matches without
    // the casting countDocuments would apply.
    Model.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          ...queryForStatusCounts(query),
          status: { $in: [...PROSPECT_RESULT_STATUSES] },
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Model.countDocuments({ ...queryForStatusCounts(query), ...ARCHIVED_PROSPECT_QUERY }),
  ]);
  const statusCounts = Object.fromEntries(
    PROSPECT_RESULT_STATUSES.map((status) => [
      status,
      statusGroups.find((group) => group._id === status)?.count ?? 0,
    ]),
  ) as Record<ProspectResultStatus, number>;
  return { rows, page, pageSize, total, statusCounts, archivedCount };
}

/** Issue #514: the To-do summary's two totals, without listProspects'
 *  page, status-group and archive queries. The same filters listProspects
 *  applies for no filter and for status `audited`. */
export async function countActiveAndAuditedProspects(
  connection: Connection,
): Promise<{ active: number; audited: number }> {
  const Model = createProspectHubModel(connection);
  const query = queryForProspects({});
  const [active, audited] = await Promise.all([
    Model.countDocuments(query),
    Model.countDocuments({ ...query, status: 'audited' }),
  ]);
  return { active, audited };
}

function queryForStatusCounts(query: Record<string, unknown>): Record<string, unknown> {
  const { status: _status, ...baseQuery } = query;
  return baseQuery;
}

export async function listProspectTodo(connection: Connection): Promise<ProspectTodoRow[]> {
  // To-do is the one intentionally unpaged view: loading prospects in pages
  // would make the shell/page count grow with the catalogue and would also
  // give the two consumers different snapshots. The work module keeps every
  // attached collection query bounded with `$in` and narrow projections.
  const prospects = await createProspectHubModel(connection)
    .find(ACTIVE_PROSPECT_QUERY)
    .select(PROSPECT_WORK_PROJECTION)
    .sort({ name: 1, prospectId: 1 })
    .lean<ProspectWorkProspect[]>();
  const work = await loadProspectWork(connection, prospects);
  return work
    .flatMap((result) => result.items)
    .sort((left, right) => Date.parse(right.since) - Date.parse(left.since));
}

export interface UpdateProspectOptions {
  /** Per-field overrides of the default 'operator' origin marking, used
   *  by fillMissingProspectIdentity to stamp detected values as
   *  'site-discovery' (issue #289). */
  fieldOrigins?: Prospect['fieldOrigins'];
}

/** Record fields an edit may change. Identity (`prospectId`, `createdAt`,
 *  `directoryRef`), lifecycle (`status`, `archivedAt`), and bookkeeping
 *  (`fieldOrigins`, timestamps) have their own dedicated writers, so a patch
 *  naming them could only ever undo those writers' work. */
const EDITABLE_PROSPECT_FIELDS = [
  'sector',
  'name',
  'websites',
  'address',
  'postcode',
  'commune',
  'department',
  'phone',
  'emails',
  'stakeholders',
  'siren',
  'siret',
  'tradingName',
  'legalName',
  'notes',
  'outreachLanguage',
  'hotel',
] as const satisfies readonly (keyof Prospect)[];

export type EditableProspectField = (typeof EDITABLE_PROSPECT_FIELDS)[number];
export type ProspectPatch = Partial<Pick<Prospect, EditableProspectField>>;

const EDITABLE_PROSPECT_FIELD_SET: ReadonlySet<string> = new Set(EDITABLE_PROSPECT_FIELDS);

export function isEditableProspectField(key: string): key is EditableProspectField {
  return EDITABLE_PROSPECT_FIELD_SET.has(key);
}

/**
 * Applies an edit as a targeted `$set`/`$unset` of the patched fields only,
 * never a replacement of the whole record. A replace written from a copy
 * read a moment earlier would silently undo anything that landed in
 * between: an archive, a status change, an opt-out. Fields outside
 * EDITABLE_PROSPECT_FIELDS are ignored.
 */
export async function updateProspect(
  connection: Connection,
  prospectId: string,
  rawPatch: ProspectPatch,
  actor = 'operator',
  options: UpdateProspectOptions = {},
): Promise<ProspectHubDocument | null> {
  const Model = createProspectHubModel(connection);
  const current = await Model.findOne({ prospectId })
    .select({ _id: 0, __v: 0 })
    .lean<ProspectHubDocument>();
  if (!current) return null;
  const editable = Object.fromEntries(
    Object.entries(rawPatch).filter(([key]) => isEditableProspectField(key)),
  ) as ProspectPatch;
  // Issue #289: a SIREN present in the patch is normalized (printed
  // spacing, or a full SIRET) and checksum-validated before it can reach
  // the stored record; an invalid one refuses the whole save. An absent
  // one (clearing the field) passes through untouched.
  const patch = withNormalizedSiren(editable);
  const normalizedPatch =
    patch.websites === undefined
      ? patch
      : {
          ...patch,
          websites: patch.websites.map((website) => {
            const resolution = normalizeDeclaredWebsite(website.url);
            return resolution.kind === 'unusable'
              ? website
              : {
                  ...website,
                  registrableDomain: resolution.registrableDomain,
                  kind: websiteKindForResolution(resolution),
                };
          }),
        };
  const next = prospectSchema.parse({
    ...current,
    ...normalizedPatch,
    updatedAt: new Date(),
    lastActivityAt: new Date(),
  });
  const editedOrigins: Prospect['fieldOrigins'] = {};
  for (const key of Object.keys(patch)) {
    if (key !== 'fieldOrigins') editedOrigins[key] = 'operator';
  }
  if (Object.keys(editedOrigins).length > 0 || options.fieldOrigins !== undefined) {
    next.fieldOrigins = {
      ...current.fieldOrigins,
      ...editedOrigins,
      ...options.fieldOrigins,
    };
  }
  // The merged record above is only validation; write origins per field so
  // a concurrent scan cannot replace origins recorded for another field.
  const $set: Record<string, unknown> = {
    updatedAt: next.updatedAt,
    lastActivityAt: next.lastActivityAt,
  };
  for (const [field, origin] of Object.entries({ ...editedOrigins, ...options.fieldOrigins })) {
    $set[`fieldOrigins.${field}`] = origin;
  }
  const $unset: Record<string, 1> = {};
  for (const key of Object.keys(patch) as EditableProspectField[]) {
    if (next[key] === undefined) $unset[key] = 1;
    else $set[key] = next[key];
  }
  const written = await Model.findOneAndUpdate(
    { prospectId },
    Object.keys($unset).length > 0 ? { $set, $unset } : { $set },
    { returnDocument: 'after', projection: { _id: 0, __v: 0 } },
  ).lean<ProspectHubDocument>();
  if (written === null) return null;
  const changedFields = Object.keys(patch).filter(
    (key) =>
      JSON.stringify(current[key as keyof Prospect]) !==
      JSON.stringify(next[key as keyof Prospect]),
  );
  await recordEvent(
    connection,
    event(prospectId, 'field-edited', { fields: changedFields }, actor),
  );
  return written;
}

async function writeProspectStatusIfCurrent(
  connection: Connection,
  current: ProspectHubDocument,
  status: ProspectStatus,
  actor: string,
): Promise<ProspectHubDocument | null> {
  if (current.status === status) return current;
  const now = new Date();
  const written = await createProspectHubModel(connection)
    .findOneAndUpdate(
      { prospectId: current.prospectId, status: current.status },
      { $set: { status, updatedAt: now, lastActivityAt: now } },
      { returnDocument: 'after', projection: { _id: 0, __v: 0 } },
    )
    .lean<ProspectHubDocument>();
  if (written === null) return getProspectHub(connection, current.prospectId);
  await recordEvent(
    connection,
    event(current.prospectId, 'status-changed', { from: current.status, to: status }, actor),
  );
  return written;
}

export async function setProspectStatus(
  connection: Connection,
  prospectId: string,
  status: ProspectStatus,
  actor = 'operator',
): Promise<ProspectHubDocument | null> {
  const current = await getProspectHub(connection, prospectId);
  if (!current) return null;
  return writeProspectStatusIfCurrent(connection, current, status, actor);
}

export interface ProspectLifecycleResult {
  prospect: ProspectHubDocument;
  /** False when the prospect was already in the requested state. */
  changed: boolean;
}

/**
 * Plan 050: takes a prospect out of active work. This write touches only the
 * lifecycle field: the prospect document, its enrichment and field origins,
 * outreach history, events, and the directory link stay where they are.
 * Issue #381: the archive action then purges the prospect's audits and their
 * stored files through the interface's `purgeProspectAuditStorage`, which
 * owns filesystem and bucket access this package does not have. Archiving is not an
 * outreach outcome either: no status, suppression, preview, or draft is
 * changed. The conditional update makes a repeated archive a no-op.
 */
export async function archiveProspect(
  connection: Connection,
  prospectId: string,
  actor = 'operator',
): Promise<ProspectLifecycleResult | null> {
  const now = new Date();
  const archived = await createProspectHubModel(connection)
    .findOneAndUpdate(
      { prospectId, ...ACTIVE_PROSPECT_QUERY },
      { $set: { archivedAt: now, updatedAt: now, lastActivityAt: now } },
      { returnDocument: 'after', projection: { _id: 0, __v: 0 } },
    )
    .lean<ProspectHubDocument>();
  if (archived === null) {
    const current = await getProspectHub(connection, prospectId);
    if (current === null) return null;
    if (current.archivedAt !== undefined) {
      await ensureLatestLifecycleEvent(connection, prospectId, 'prospect-archived', actor);
    }
    return { prospect: current, changed: false };
  }
  await recordEvent(connection, event(prospectId, 'prospect-archived', {}, actor));
  return { prospect: archived, changed: true };
}

type LifecycleEventType = 'prospect-archived' | 'prospect-restored';

/**
 * State and event are two writes without a shared transaction, so an event
 * write can fail after the state change landed. The operator's retry then
 * finds nothing to change; this is where it repairs the history instead of
 * returning with the entry still missing. The newest lifecycle event must
 * agree with the state: an archived prospect's is an archive, and a restored
 * one's is a restore. A prospect never archived has no lifecycle events and
 * needs none.
 */
async function ensureLatestLifecycleEvent(
  connection: Connection,
  prospectId: string,
  expected: LifecycleEventType,
  actor: string,
): Promise<void> {
  const latest = await createProspectEventModel(connection)
    .findOne({ prospectId, type: { $in: ['prospect-archived', 'prospect-restored'] } })
    .sort({ at: -1 })
    .select({ type: 1, _id: 0 })
    .lean<{ type: LifecycleEventType }>();
  if (latest?.type === expected) return;
  if (latest === null && expected === 'prospect-restored') return;
  await recordEvent(connection, event(prospectId, expected, { repaired: true }, actor));
}

/** Returns an archived prospect to active work on the same prospectId, with
 *  its CRM record and correspondence as they were. Audits purged at archive
 *  (issue #381) do not come back; a new Full scan recaptures the evidence.
 *  Restoring an active prospect is a no-op. */
export async function restoreProspect(
  connection: Connection,
  prospectId: string,
  actor = 'operator',
): Promise<ProspectLifecycleResult | null> {
  const now = new Date();
  const restored = await createProspectHubModel(connection)
    .findOneAndUpdate(
      { prospectId, ...ARCHIVED_PROSPECT_QUERY },
      { $unset: { archivedAt: 1 }, $set: { updatedAt: now, lastActivityAt: now } },
      { returnDocument: 'after', projection: { _id: 0, __v: 0 } },
    )
    .lean<ProspectHubDocument>();
  if (restored === null) {
    const current = await getProspectHub(connection, prospectId);
    if (current === null) return null;
    if (current.archivedAt === undefined) {
      await ensureLatestLifecycleEvent(connection, prospectId, 'prospect-restored', actor);
    }
    return { prospect: current, changed: false };
  }
  await recordEvent(connection, event(prospectId, 'prospect-restored', {}, actor));
  return { prospect: restored, changed: true };
}

export async function advanceProspectStatus(
  connection: Connection,
  prospectId: string,
  status: Exclude<ProspectStatus, 'new' | 'opted-out'>,
  actor = 'automation',
): Promise<ProspectHubDocument | null> {
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;
  const decision = decideAutomaticStatus(current.status, status);
  if (!decision.allowed || !decision.changed) return current;
  return writeProspectStatusIfCurrent(connection, current, status, actor);
}

class AutomaticStatusTransitionError extends Error {
  readonly current: ProspectStatus;
  readonly requested: ProspectStatus;

  constructor(current: ProspectStatus, requested: ProspectStatus) {
    super(`automatic status transition from ${current} to ${requested} is not allowed`);
    this.name = 'AutomaticStatusTransitionError';
    this.current = current;
    this.requested = requested;
  }
}

async function suppressProspect(
  connection: Connection,
  prospect: ProspectHubDocument,
): Promise<void> {
  const website = primaryWebsite(prospect.websites);
  const domains = new Set<string>();
  // Issue #341: one prospect's objection must never silence a free-mail
  // provider for every other prospect whose contact uses it.
  if (website?.registrableDomain !== undefined && !isFreeMailDomain(website.registrableDomain)) {
    domains.add(website.registrableDomain);
  }
  for (const email of prospect.emails) {
    const domain = emailDomain(email.address);
    if (domain !== undefined && !isFreeMailDomain(domain)) domains.add(domain);
  }
  await Promise.all(
    [...domains].map((domain) =>
      addSuppressionEntry(connection, {
        domain,
        reasonCode: 'objection',
        reason: 'opt-out recorded on the prospect',
      }),
    ),
  );
  await Promise.all(
    prospect.emails.map((email) => {
      const domain = emailDomain(email.address);
      if (domain === undefined) return Promise.resolve();
      return addSuppressionEntry(connection, {
        domain,
        address: email.address,
        addressOnly: isFreeMailDomain(domain),
        reasonCode: 'objection',
        reason: 'opt-out recorded on the prospect',
      });
    }),
  );
}

/** Applies a workflow status requested by an automated outcome or scan
 *  effect. Unlike setProspectStatus, this refuses terminal sibling changes
 *  and regressions so callers cannot silently overwrite a manual result. */
export interface ProspectStatusSuppressionOptions {
  /** 'already-applied' means the caller has already written the suppression
   *  reach the rules allow (the public opt-out, trade-off 89), so opting the
   *  prospect out must not widen it. */
  suppression?: 'apply' | 'already-applied';
}

export async function applyAutomaticProspectStatus(
  connection: Connection,
  prospectId: string,
  status: Exclude<ProspectStatus, 'new'>,
  actor = 'automation',
  options: ProspectStatusSuppressionOptions = {},
): Promise<ProspectHubDocument | null> {
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;
  if (status === 'opted-out' && options.suppression !== 'already-applied') {
    // Re-applying an existing opt-out repairs suppression if an earlier
    // status write predated the durable suppression side effect. Written
    // before the transition is decided: an objection is honoured whatever
    // the prospect's status (issue #535).
    await suppressProspect(connection, current);
  }
  const decision = decideAutomaticStatus(current.status, status);
  // A won or lost prospect keeps its result when it objects; the
  // suppression above already stops any further contact, as on the public
  // opt-out path.
  if (!decision.allowed && status === 'opted-out') return current;
  if (!decision.allowed) throw new AutomaticStatusTransitionError(current.status, status);
  if (!decision.changed) return current;
  return writeProspectStatusIfCurrent(connection, current, status, actor);
}

export async function listProspectEvents(
  connection: Connection,
  prospectId: string,
  limit = 200,
): Promise<ProspectEventDocument[]> {
  return createProspectEventModel(connection)
    .find({ prospectId })
    .sort({ at: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .lean<ProspectEventDocument[]>();
}

type ProspectAuditRow = Pick<
  AuditDocument,
  'auditId' | 'siteUrl' | 'kind' | 'scanIntent' | 'startedAt' | 'finishedAt'
> & {
  siteSignals?: { roleContact?: { address: string; sourceUrl: string } };
  retention?: { slimmedAt?: Date };
};

export async function listProspectAudits(
  connection: Connection,
  prospectId: string,
): Promise<ProspectAuditRow[]> {
  return createAuditModel(connection)
    .find({ prospectId })
    .select({
      auditId: 1,
      siteUrl: 1,
      kind: 1,
      scanIntent: 1,
      startedAt: 1,
      finishedAt: 1,
      'siteSignals.roleContact': 1,
      'retention.slimmedAt': 1,
    })
    .sort({ startedAt: -1 })
    .lean<ProspectAuditRow[]>();
}

export type DirectoryProspectState = 'active' | 'archived';

export type DirectoryListRow = DirectoryEntryDocument & {
  /** Plan 050: lifecycle of the linked prospect, read from the prospect
   *  rather than copied into the directory. Absent when unlinked, or when a
   *  link points at a prospect that no longer exists. */
  prospectState?: DirectoryProspectState;
};

/** The one mapping from directory facets to a Mongo query, shared by the
 *  paged directory list and the random independent draw. Pagination is not
 *  a facet and is ignored here. */
function queryForDirectory(filter: DirectoryFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filter.sector) query['sector'] = filter.sector;
  if (filter.stars !== undefined) query['stars'] = filter.stars;
  if (filter.groupStatus) query['groupStatus'] = filter.groupStatus;
  if (filter.websiteKind) query['websiteKind'] = filter.websiteKind;
  if (filter.department) query['department'] = filter.department;
  if (filter.commune) query['commune'] = filter.commune;
  if (filter.postcode) query['postcode'] = filter.postcode;
  if (filter.roomsMin !== undefined || filter.roomsMax !== undefined) {
    query['rooms'] = {
      ...(filter.roomsMin !== undefined ? { $gte: filter.roomsMin } : {}),
      ...(filter.roomsMax !== undefined ? { $lte: filter.roomsMax } : {}),
    };
  }
  if (filter.q) query['name'] = new RegExp(escapeRegex(filter.q), 'i');
  return query;
}

export async function listDirectory(
  connection: Connection,
  filter: DirectoryFilter = {},
): Promise<Page<DirectoryListRow>> {
  const [page, pageSize] = pageBounds(filter.page, filter.pageSize);
  const query = queryForDirectory(filter);
  const Model = createDirectoryEntryModel(connection);
  const [entries, total] = await Promise.all([
    Model.find(query)
      .sort({ name: 1, directoryId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<DirectoryEntryDocument[]>(),
    Model.countDocuments(query),
  ]);
  const linkedIds = unique(entries.map((entry) => entry.prospectId));
  const linked =
    linkedIds.length === 0
      ? []
      : await createProspectHubModel(connection)
          .find({ prospectId: { $in: linkedIds } })
          .select({ _id: 0, prospectId: 1, archivedAt: 1 })
          .lean<Pick<ProspectHubDocument, 'prospectId' | 'archivedAt'>[]>();
  const stateById = new Map<string, DirectoryProspectState>(
    linked.map((prospect) => [
      prospect.prospectId,
      prospect.archivedAt === undefined ? 'active' : 'archived',
    ]),
  );
  const rows = entries.map((entry): DirectoryListRow => {
    if (entry.prospectId === undefined) return entry;
    const prospectState = stateById.get(entry.prospectId);
    if (prospectState !== undefined) return { ...entry, prospectState };
    // A link to a prospect that does not exist (an add interrupted between
    // its claim and the insert) is shown as unlinked, so the directory
    // offers Add, which repairs it, instead of an Open that 404s.
    const { prospectId: _dangling, ...unlinked } = entry;
    return unlinked;
  });
  return { rows, page, pageSize, total };
}

function unique(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))];
}

/**
 * Creates one prospect per unlinked directory entry. Each entry is claimed
 * first with a conditional write of a pre-minted prospectId, so two
 * concurrent or repeated clicks can never manufacture a second prospect: the
 * losing request matches nothing. An entry already linked to a prospect,
 * active or archived, is never re-added; the directory offers Open or
 * Restore for those instead.
 */
export async function addDirectoryEntriesToProspects(
  connection: Connection,
  directoryIds: readonly string[],
  actor = 'operator',
  now: Date = new Date(),
): Promise<ProspectHubDocument[]> {
  if (directoryIds.length === 0) return [];
  const Directory = createDirectoryEntryModel(connection);
  await releaseDanglingDirectoryClaims(connection, directoryIds, now);
  const entries = await Directory.find({
    directoryId: { $in: directoryIds },
    prospectId: { $exists: false },
  }).lean<DirectoryEntry[]>();
  const created: ProspectHubDocument[] = [];
  for (const entry of entries) {
    const prospectId = randomUUID();
    const claim = await Directory.updateOne(
      { directoryId: entry.directoryId, prospectId: { $exists: false } },
      { $set: { prospectId, updatedAt: new Date() } },
    );
    if (claim.modifiedCount === 0) continue;
    try {
      const prospect = await createProspectHub(
        connection,
        directoryEntryToProspectInput(entry),
        actor,
        prospectId,
      );
      created.push(prospect);
    } catch (error) {
      // Release the claim only when the prospect was never inserted, so the
      // entry is not left pointing at nothing. When the insert landed and a
      // later write (its creation event) failed, the prospect exists: keep
      // the link, or the next Add would create a second prospect.
      if ((await getProspectHub(connection, prospectId)) === null) {
        await Directory.updateOne(
          { directoryId: entry.directoryId, prospectId },
          { $unset: { prospectId: '' }, $set: { updatedAt: new Date() } },
        );
      }
      throw error;
    }
  }
  return created;
}

/** How many times a random draw resamples after a concurrent add claimed
 *  the sampled entry first. A lost claim is rare; the bound keeps a busy or
 *  shrinking pool from looping. */
const RANDOM_DRAW_ATTEMPTS = 5;

/**
 * Plan 074: draws one unlinked independent directory entry uniformly from the
 * whole pool matching the directory facets, and creates its prospect through
 * addDirectoryEntriesToProspects, the only directory-to-prospect path.
 * Independence is the stored groupStatus facet, forced whatever the filter
 * says; pagination is ignored. Returns null when nothing eligible remains.
 */
export async function createRandomIndependentProspectFromDirectory(
  connection: Connection,
  filter: DirectoryFilter = {},
  actor = 'operator',
): Promise<ProspectHubDocument | null> {
  const { page: _page, pageSize: _pageSize, ...facets } = filter;
  const query = {
    ...queryForDirectory({ ...facets, groupStatus: 'independent' }),
    prospectId: { $exists: false },
  };
  const Directory = createDirectoryEntryModel(connection);
  for (let attempt = 0; attempt < RANDOM_DRAW_ATTEMPTS; attempt += 1) {
    const [sampled] = await Directory.aggregate<{ directoryId: string }>([
      { $match: query },
      { $sample: { size: 1 } },
      { $project: { _id: 0, directoryId: 1 } },
    ]);
    if (sampled === undefined) return null;
    const [created] = await addDirectoryEntriesToProspects(
      connection,
      [sampled.directoryId],
      actor,
    );
    if (created !== undefined) return created;
  }
  return null;
}

/** How old a claim on a directory entry must be before a link to a missing
 *  prospect counts as abandoned. An add in flight holds its claim for
 *  milliseconds before inserting; anything this old was interrupted. */
export const DANGLING_DIRECTORY_CLAIM_AGE_MS = 5 * 60 * 1000;

/** Unlinks requested entries whose prospectId names no prospect, left by an
 *  add that crashed between its claim and the insert, so Add can take them
 *  again. Recent claims are left alone: they may belong to an add that is
 *  about to insert. The unlink is conditional on the same stale link. */
async function releaseDanglingDirectoryClaims(
  connection: Connection,
  directoryIds: readonly string[],
  now: Date,
): Promise<void> {
  const Directory = createDirectoryEntryModel(connection);
  const staleBefore = new Date(now.getTime() - DANGLING_DIRECTORY_CLAIM_AGE_MS);
  const linked = await Directory.find({
    directoryId: { $in: directoryIds },
    prospectId: { $exists: true },
    updatedAt: { $lt: staleBefore },
  })
    .select({ directoryId: 1, prospectId: 1, _id: 0 })
    .lean<{ directoryId: string; prospectId: string }[]>();
  if (linked.length === 0) return;
  const existing = new Set(
    (
      await createProspectHubModel(connection)
        .find({ prospectId: { $in: linked.map((entry) => entry.prospectId) } })
        .select({ prospectId: 1, _id: 0 })
        .lean<{ prospectId: string }[]>()
    ).map((prospect) => prospect.prospectId),
  );
  for (const entry of linked) {
    if (existing.has(entry.prospectId)) continue;
    await Directory.updateOne(
      { directoryId: entry.directoryId, prospectId: entry.prospectId },
      { $unset: { prospectId: '' }, $set: { updatedAt: now } },
    );
  }
}

export interface ProspectCascadeCounts extends AuditCascadeCounts {
  prospects: number;
  previews: number;
  drafts: number;
  threads: number;
  outcomes: number;
  events: number;
  jobs: number;
  directoryEntries: number;
}

export interface ProspectDeletionImpact {
  audits: number;
  findings: number;
  analyses: number;
  reports: number;
  reportApprovals: number;
  reportQualityLeases: number;
  reportQualityRuns: number;
  reportBundles: number;
  activeReportBundles: number;
  previews: number;
  drafts: number;
  threads: number;
  outcomes: number;
  events: number;
  jobs: number;
  directoryEntries: number;
}

/** The record sets a permanent delete touches. countProspectDeletionImpact
 *  and deleteProspectPermanently both build their queries from this, so the
 *  confirmation cannot name a different scope than the cascade removes. */
interface ProspectDeletionScope {
  auditIds: string[];
  threadIds: string[];
  audit: Record<string, unknown>;
  outcome: Record<string, unknown>;
  job: Record<string, unknown>;
}

async function prospectDeletionScope(
  connection: Connection,
  prospectId: string,
): Promise<ProspectDeletionScope> {
  const [audits, threads] = await Promise.all([
    createAuditModel(connection)
      .find({ prospectId })
      .select({ auditId: 1, _id: 0 })
      .lean<{ auditId: string }[]>(),
    createOutreachThreadModel(connection)
      .find({ prospectId })
      .select({ threadId: 1, _id: 0 })
      .lean<{ threadId: string }[]>(),
  ]);
  const auditIds = audits.map((audit) => audit.auditId);
  const threadIds = threads.map((thread) => thread.threadId);
  return {
    auditIds,
    threadIds,
    audit: { auditId: { $in: auditIds } },
    outcome: {
      $or: [{ prospectId }, ...(threadIds.length === 0 ? [] : [{ threadId: { $in: threadIds } }])],
    },
    // A job belongs to the prospect when it was started for it, or when it
    // points at one of its audits (a scan attached to the prospect later, or
    // a re-audit comparing two of them). Leaving the latter would keep job
    // links to audits that no longer exist.
    job: {
      $or: [
        { 'options.prospectId': prospectId },
        ...(auditIds.length === 0
          ? []
          : [{ auditId: { $in: auditIds } }, { auditIds: { $in: auditIds } }]),
      ],
    },
  };
}

/** Issue #383: a 'needs-input' job has stopped and cannot recreate
 *  anything, so it does not block a delete or archive cleanup. */
const ACTIVE_JOB_STATUSES = JOB_STATUSES_CAN_STILL_WRITE;

/** Counts the unfinished jobs a permanent delete would remove. Deleting under
 *  a running job lets its later stages recreate the audit and artifacts the
 *  delete just removed, so the caller refuses while this is non-zero. */
export async function countActiveProspectDeletionJobs(
  connection: Connection,
  prospectId: string,
): Promise<number> {
  const scope = await prospectDeletionScope(connection, prospectId);
  return createJobModel(connection).countDocuments({
    $and: [scope.job, { status: { $in: ACTIVE_JOB_STATUSES } }],
  });
}

/** Every job in the prospect's deletion scope, any status. The interface
 *  checks these against its in-process queue: a stopped job is already
 *  `cancelled` while its pipeline finishes the current stage. */
export async function listProspectScopeJobIds(
  connection: Connection,
  prospectId: string,
): Promise<string[]> {
  const scope = await prospectDeletionScope(connection, prospectId);
  const jobs = await createJobModel(connection)
    .find(scope.job)
    .select({ jobId: 1, _id: 0 })
    .lean<{ jobId: string }[]>();
  return jobs.map((job) => job.jobId);
}

/** The site and run identity of every job in the prospect's deletion scope
 *  that started a run, so the interface can remove each run's directory,
 *  including the runs that never persisted an audit. */
export async function listProspectScopeJobRuns(
  connection: Connection,
  prospectId: string,
): Promise<{ siteUrl: string; runIdentity: JobRunIdentity }[]> {
  const scope = await prospectDeletionScope(connection, prospectId);
  return createJobModel(connection)
    .find({ $and: [scope.job, { siteUrl: { $exists: true }, runIdentity: { $exists: true } }] })
    .select({ siteUrl: 1, runIdentity: 1, _id: 0 })
    .lean<{ siteUrl: string; runIdentity: JobRunIdentity }[]>();
}

/** What deleteProspectPermanently would remove, counted without removing
 *  anything, so the confirmation can state the scope before the operator
 *  commits to it. */
export async function countProspectDeletionImpact(
  connection: Connection,
  prospectId: string,
): Promise<ProspectDeletionImpact | null> {
  if ((await getProspectHub(connection, prospectId)) === null) return null;
  const scope = await prospectDeletionScope(connection, prospectId);
  const [
    findings,
    analyses,
    reports,
    reportApprovals,
    reportQualityLeases,
    reportQualityRuns,
    reportBundles,
    activeReportBundles,
    previews,
    drafts,
    outcomes,
    events,
    jobs,
  ] = await Promise.all([
    createFindingModel(connection).countDocuments(scope.audit),
    createAnalysisModel(connection).countDocuments(scope.audit),
    createReportModel(connection).countDocuments(scope.audit),
    createReportApprovalModel(connection).countDocuments(scope.audit),
    createReportQualityLeaseModel(connection).countDocuments(scope.audit),
    createReportQualityRunModel(connection).countDocuments(scope.audit),
    createReportBundleModel(connection).countDocuments(scope.audit),
    createActiveReportBundleModel(connection).countDocuments(scope.audit),
    createOutreachPreviewModel(connection).countDocuments({ prospectId }),
    createOutreachDraftModel(connection).countDocuments({ prospectId }),
    createOutreachOutcomeModel(connection).countDocuments(scope.outcome),
    createProspectEventModel(connection).countDocuments({ prospectId }),
    createJobModel(connection).countDocuments(scope.job),
  ]);
  const directoryEntries = await createDirectoryEntryModel(connection).countDocuments({
    prospectId,
  });
  return {
    audits: scope.auditIds.length,
    findings,
    analyses,
    reports,
    reportApprovals,
    reportQualityLeases,
    reportQualityRuns,
    reportBundles,
    activeReportBundles,
    previews,
    drafts,
    threads: scope.threadIds.length,
    outcomes,
    events,
    jobs,
    directoryEntries,
  };
}

/**
 * Permanently removes one prospect and the operational material attached to
 * it. This is the exceptional path (duplicates, test records, bad imports);
 * ordinary removal from active work is archiveProspect, which never runs
 * this cascade. Suppression is intentionally absent: opting out is a durable
 * safety fact, not prospect-owned history.
 *
 * The prospect record is removed last. Every earlier step is an idempotent
 * delete or unlink, so if one fails the prospect is still there and the
 * operator's retry finishes the cascade instead of leaving attached records
 * behind a prospect that no longer exists.
 */
export async function deleteProspectPermanently(
  connection: Connection,
  prospectId: string,
): Promise<ProspectCascadeCounts | null> {
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;

  const scope = await prospectDeletionScope(connection, prospectId);
  const auditCounts = await Promise.all(
    scope.auditIds.map((auditId) => deleteAuditCascade(connection, auditId)),
  );
  const auditTotals = auditCounts.reduce<AuditCascadeCounts>(
    (total, count) => ({
      audits: total.audits + count.audits,
      findings: total.findings + count.findings,
      analyses: total.analyses + count.analyses,
      reports: total.reports + count.reports,
      reportApprovals: total.reportApprovals + count.reportApprovals,
      reportQualityLeases: total.reportQualityLeases + count.reportQualityLeases,
      reportQualityRuns: total.reportQualityRuns + count.reportQualityRuns,
      reportBundles: total.reportBundles + count.reportBundles,
      activeReportBundles: total.activeReportBundles + count.activeReportBundles,
    }),
    {
      audits: 0,
      findings: 0,
      analyses: 0,
      reports: 0,
      reportApprovals: 0,
      reportQualityLeases: 0,
      reportQualityRuns: 0,
      reportBundles: 0,
      activeReportBundles: 0,
    },
  );

  const Preview = createOutreachPreviewModel(connection);
  await Preview.updateMany(
    { prospectId, status: 'live' },
    {
      $set: { status: 'revoked', revokedAt: new Date(), revokedReason: 'prospect-deleted' },
      $unset: { previewUrl: 1 },
    },
  );
  // Attribution mappings are prospect-owned private data. They are not
  // included in the operator-facing cascade count because the public
  // reference remains independent, but they must disappear with the
  // prospect rather than waiting for the 90-day TTL.
  await createReferenceAuditLinkModel(connection).deleteMany({ prospectId }).exec();
  const [previews, drafts, threads, outcomes, events, jobs, directoryEntries] = await Promise.all([
    Preview.deleteMany({ prospectId }).exec(),
    createOutreachDraftModel(connection).deleteMany({ prospectId }).exec(),
    createOutreachThreadModel(connection).deleteMany({ prospectId }).exec(),
    createOutreachOutcomeModel(connection).deleteMany(scope.outcome).exec(),
    createProspectEventModel(connection).deleteMany({ prospectId }).exec(),
    createJobModel(connection).deleteMany(scope.job).exec(),
    createDirectoryEntryModel(connection)
      .updateMany({ prospectId }, { $unset: { prospectId: '' }, $set: { updatedAt: new Date() } })
      .exec(),
  ]);
  const prospects = await createProspectHubModel(connection).deleteOne({ prospectId }).exec();

  return {
    ...auditTotals,
    prospects: prospects.deletedCount,
    previews: previews.deletedCount,
    drafts: drafts.deletedCount,
    threads: threads.deletedCount,
    outcomes: outcomes.deletedCount,
    events: events.deletedCount,
    jobs: jobs.deletedCount,
    directoryEntries: directoryEntries.modifiedCount,
  };
}

export interface WithdrawnProspectOutreach {
  drafts: number;
  previews: number;
  threadClosed: boolean;
  /** Mailbox drafts the caller still has to delete at the provider. */
  providerDraftIds: string[];
  providerDrafts: Array<{ draftId: string; providerDraftId?: string }>;
  /** Public preview objects the caller still has to delete from the bucket. */
  previewObjectKeys: string[];
}

/**
 * Takes every pending outreach artefact of one prospect out of circulation:
 * unsent drafts leave review, live previews are revoked, and an active thread
 * moves to its terminal state. Sent history is never touched. Provider-side
 * cleanup is returned rather than performed, because the store has no I/O
 * adapters.
 */
export async function withdrawProspectOutreach(
  connection: Connection,
  prospectId: string,
  reason: 'opted-out' | 'prospect-deleted',
): Promise<WithdrawnProspectOutreach> {
  const now = new Date();
  const Drafts = createOutreachDraftModel(connection);
  const pendingDrafts = await Drafts.find({
    prospectId,
    status: { $in: ['created', 'mailbox-delete-pending'] },
  })
    .select({ draftId: 1, providerDraftId: 1, status: 1, _id: 0 })
    .lean<
      { draftId: string; providerDraftId?: string; status: 'created' | 'mailbox-delete-pending' }[]
    >();
  const newlyPendingDraftIds = pendingDrafts
    .filter((draft) => draft.status === 'created')
    .map((draft) => draft.draftId);
  const providerDrafts = pendingDrafts.map(({ draftId, providerDraftId }) => ({
    draftId,
    ...(providerDraftId === undefined ? {} : { providerDraftId }),
  }));
  if (newlyPendingDraftIds.length > 0) {
    await Drafts.updateMany(
      { draftId: { $in: newlyPendingDraftIds }, status: 'created' },
      { $set: { status: 'mailbox-delete-pending' } },
    );
  }

  const Previews = createOutreachPreviewModel(connection);
  const livePreviews = await Previews.find({ prospectId, status: 'live' })
    .select({ previewId: 1, objectKey: 1, _id: 0 })
    .lean<{ previewId: string; objectKey: string }[]>();
  if (livePreviews.length > 0) {
    await Previews.updateMany(
      { previewId: { $in: livePreviews.map((preview) => preview.previewId) }, status: 'live' },
      {
        $set: { status: 'revoked', revokedAt: now, revokedReason: reason },
        $unset: { previewUrl: 1 },
      },
    );
  }

  const threads = await createOutreachThreadModel(connection)
    .find({ prospectId, state: { $in: ACTIVE_OUTREACH_THREAD_STATES } })
    .select({ threadId: 1, _id: 0 })
    .lean<{ threadId: string }[]>();
  let threadClosed = false;
  for (const thread of threads) {
    const closedReason: OutreachClosedReason = 'prospect-deleted';
    const result = await transitionOutreachThread(connection, {
      threadId: thread.threadId,
      from: ACTIVE_OUTREACH_THREAD_STATES,
      at: now,
      ...(reason === 'opted-out'
        ? { to: 'opted-out', reason }
        : { to: 'closed', reason: closedReason }),
    });
    threadClosed ||= result.changed;
  }

  return {
    drafts: newlyPendingDraftIds.length,
    previews: livePreviews.length,
    threadClosed,
    providerDraftIds: providerDrafts.flatMap((draft) =>
      draft.providerDraftId === undefined ? [] : [draft.providerDraftId],
    ),
    providerDrafts,
    previewObjectKeys: livePreviews.map((preview) => preview.objectKey),
  };
}

export interface RecordProspectOutcomeOptions extends ProspectStatusSuppressionOptions {
  /** Why the prospect declined; the caller decides which outcomes carry one. */
  lostReason?: OutreachLostReason;
  /** A retried request repeats its key and then records nothing twice. */
  idempotencyKey?: string;
}

/**
 * Records the operator's outcome for a prospect: its status, the outcome row
 * of its outreach thread with the thread's pointer to it, and the prospect
 * event. A prospect with no thread keeps only the status and the event.
 */
export async function recordProspectOutcome(
  connection: Connection,
  prospectId: string,
  outcome: string,
  actor = 'operator',
  options: RecordProspectOutcomeOptions = {},
): Promise<ProspectHubDocument | null> {
  const status: Exclude<ProspectStatus, 'new'> | undefined = {
    'reply-positive': 'replied',
    'reply-not-now': 'replied',
    'reply-negative': 'lost',
    'opt-out': 'opted-out',
    call: 'call',
    quoted: 'quoted',
    won: 'won',
    lost: 'lost',
  }[outcome] as Exclude<ProspectStatus, 'new'> | undefined;
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;
  const prospect =
    status === undefined
      ? current
      : await applyAutomaticProspectStatus(connection, prospectId, status, actor, options);
  if (prospect === null) return null;
  if (isOutreachOutcome(outcome)) {
    const recorded = await recordOutreachThreadOutcome(connection, {
      prospectId,
      outcome,
      ...(options.lostReason === undefined ? {} : { lostReason: options.lostReason }),
      actor,
      at: new Date(),
      ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
    });
    if (recorded === 'already-recorded') return prospect;
  }
  await recordEvent(
    connection,
    event(
      prospectId,
      outcome === 'opt-out' ? 'opted-out' : 'outcome-recorded',
      { outcome, ...(options.lostReason === undefined ? {} : { lostReason: options.lostReason }) },
      actor,
    ),
  );
  return prospect;
}

/**
 * Issue #289: fill the prospect's identity fields (SIREN, trading name,
 * legal name) that nobody has set yet from scan-detected candidates. An
 * existing value - manual or previously detected - is never replaced
 * here; replacement is always an explicit operator edit through
 * updateProspect. Every field actually written is stamped 'site-discovery'
 * in fieldOrigins, so manual vs detected stays readable, and a 'field-
 * edited' event records the change. Writes nothing and returns the
 * unchanged prospect when there is nothing to fill. Detectors feed this
 * seam (see prospect-identity.ts); no network lookups live here.
 */
export async function fillMissingProspectIdentity(
  connection: Connection,
  prospectId: string,
  detected: ProspectIdentityValues,
  actor = 'scan',
): Promise<ProspectHubDocument | null> {
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;
  const fill = missingProspectIdentityFill(current, detected);
  const fields = Object.keys(fill) as ProspectIdentityField[];
  if (fields.length === 0) return current;
  const Model = createProspectHubModel(connection);
  const now = new Date();
  for (const field of fields) {
    const value = fill[field];
    if (value === undefined) continue;
    await Model.updateOne(
      { prospectId, [field]: { $exists: false } },
      {
        $set: {
          [field]: value,
          [`fieldOrigins.${field}`]: DETECTED_IDENTITY_ORIGIN,
          updatedAt: now,
          lastActivityAt: now,
        },
      },
    );
  }
  const updated = await getProspectHub(connection, prospectId);
  if (updated === null) return null;
  const filledFields = fields.filter(
    (field) =>
      current[field] === undefined &&
      JSON.stringify(current[field]) !== JSON.stringify(updated[field]),
  );
  if (filledFields.length > 0) {
    await recordEvent(
      connection,
      event(prospectId, 'field-edited', { fields: filledFields }, actor),
    );
  }
  return updated;
}

export async function upsertDirectoryEntries(
  connection: Connection,
  entries: readonly DirectoryEntry[],
): Promise<{ created: number; updated: number }> {
  if (entries.length === 0) return { created: 0, updated: 0 };
  const validatedEntries = entries.map((entry) => directoryEntrySchema.parse(entry));
  const Model = createDirectoryEntryModel(connection);
  await Model.init();
  const now = new Date();
  const result = await Model.bulkWrite(
    validatedEntries.map((entry) => {
      // The prospect link is operator state, never source data: a directory
      // refresh must not clear or overwrite it (Plan 050).
      const { createdAt, prospectId: _sourceProspectId, ...fields } = entry;
      return {
        updateOne: {
          filter: { directoryId: entry.directoryId },
          update: {
            $set: { ...fields, updatedAt: now },
            $setOnInsert: { createdAt },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );
  const domains = new Set(
    validatedEntries
      .filter((entry) => entry.registrableDomain !== undefined)
      .map((entry) => entry.registrableDomain!),
  );
  for (const domain of domains) {
    await Model.updateMany(
      { registrableDomain: domain, websiteKind: 'vendor-hosted' },
      { $set: { groupStatus: 'vendor-hosted', groupDomain: domain, updatedAt: now } },
    );
    const ownCount = await Model.countDocuments({
      registrableDomain: domain,
      websiteKind: 'own',
    });
    await Model.updateMany(
      { registrableDomain: domain, websiteKind: 'chain' },
      { $set: { groupStatus: 'group-member', groupDomain: domain, updatedAt: now } },
    );
    if (ownCount > 1) {
      await Model.updateMany(
        { registrableDomain: domain, websiteKind: 'own' },
        { $set: { groupStatus: 'group-member', groupDomain: domain, updatedAt: now } },
      );
      continue;
    }
    // A lone own domain reads as independent unless the name carries a
    // corporate brand, which stays unknown for review (issue #394).
    const singles = await Model.find({ registrableDomain: domain, websiteKind: 'own' })
      .select({ directoryId: 1, name: 1, _id: 0 })
      .lean<Pick<DirectoryEntry, 'directoryId' | 'name'>[]>();
    for (const single of singles) {
      await Model.updateOne(
        { directoryId: single.directoryId },
        {
          $set: {
            groupStatus: hasHotelChainBrandName(single.name) ? 'unknown' : 'independent',
            updatedAt: now,
          },
          $unset: { groupDomain: 1 },
        },
      );
    }
  }
  return { created: result.upsertedCount, updated: result.modifiedCount };
}

export function directoryEntryToProspectInput(entry: DirectoryEntry): NewProspectHubInput {
  return {
    sector: entry.sector,
    name: entry.name,
    websites:
      entry.websiteUrl && entry.registrableDomain
        ? [
            {
              url: entry.websiteUrl,
              registrableDomain: entry.registrableDomain,
              kind: entry.websiteKind,
              primary: true,
            },
          ]
        : [],
    address: entry.address,
    postcode: entry.postcode,
    commune: entry.commune,
    department: entry.department,
    phone: entry.phone,
    hotel: {
      stars: entry.stars,
      rooms: entry.rooms,
      capacity: entry.capacity,
      groupStatus: entry.groupStatus,
      groupDomain: entry.groupDomain,
    },
    fieldOrigins: {
      name: 'atout-france',
      address: 'atout-france',
      postcode: 'atout-france',
      commune: 'atout-france',
      department: 'atout-france',
      phone: 'atout-france',
      hotel: 'atout-france',
      websites: 'atout-france',
    },
    directoryRef: {
      source: entry.sourceRefs[0]?.source ?? 'atout-france',
      sourceId: entry.sourceRefs[0]?.sourceId ?? entry.directoryId,
    },
  };
}
