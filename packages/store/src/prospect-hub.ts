import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { Prospect } from '@odysseus/core';
import type {
  DirectoryEntry,
  ProspectEvent,
  ProspectStatus,
  ProspectWebsiteKind,
} from '@odysseus/core';
import { ACTIVE_OUTREACH_THREAD_STATES, normalizeDeclaredWebsite } from '@odysseus/core';
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
import { createJobModel } from './schemas/job.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { transitionOutreachThread } from './outreach-threads.js';
import { deleteAuditCascade, type AuditCascadeCounts } from './delete-audit.js';
import { addSuppressionEntry } from './suppression.js';
import { loadProspectWork, type ProspectTodoRow } from './prospect-work.js';
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

export const PROSPECT_RESULT_STATUSES = [
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
}

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
  return query;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createProspectHub(
  connection: Connection,
  rawInput: NewProspectHubInput,
  actor = 'operator',
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
          kind: resolution.kind === 'own-domain' ? 'own' : 'vendor-hosted',
        };
  });
  const value = prospectSchema.parse({
    prospectId: randomUUID(),
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
    fieldOrigins: input.fieldOrigins ?? { name: 'operator' },
    directoryRef: input.directoryRef,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  });
  await createProspectHubModel(connection).create(value);
  await recordEvent(
    connection,
    event(value.prospectId, 'field-edited', { fields: Object.keys(input) }, actor),
  );
  return value;
}

export async function getProspectHub(
  connection: Connection,
  prospectId: string,
): Promise<ProspectHubDocument | null> {
  return createProspectHubModel(connection).findOne({ prospectId }).lean<ProspectHubDocument>();
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
  const statusCounts = Object.fromEntries(
    await Promise.all(
      PROSPECT_RESULT_STATUSES.map(
        async (status) =>
          [status, await Model.countDocuments({ ...queryForStatusCounts(query), status })] as const,
      ),
    ),
  ) as Record<ProspectResultStatus, number>;
  const [rows, total] = await Promise.all([
    Model.find(query)
      .sort({ name: 1, prospectId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<ProspectHubDocument[]>(),
    Model.countDocuments(query),
  ]);
  return { rows, page, pageSize, total, statusCounts };
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
    .find({})
    .sort({ name: 1, prospectId: 1 })
    .lean<ProspectHubDocument[]>();
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

export async function updateProspect(
  connection: Connection,
  prospectId: string,
  rawPatch: Partial<Omit<Prospect, 'prospectId' | 'createdAt' | 'updatedAt' | 'lastActivityAt'>>,
  actor = 'operator',
  options: UpdateProspectOptions = {},
): Promise<ProspectHubDocument | null> {
  const Model = createProspectHubModel(connection);
  const current = await Model.findOne({ prospectId })
    .select({ _id: 0, __v: 0 })
    .lean<ProspectHubDocument>();
  if (!current) return null;
  // Issue #289: a SIREN present in the patch is normalized (printed
  // spacing, or a full SIRET) and checksum-validated before it can reach
  // the stored record; an invalid one refuses the whole save. An absent
  // one (clearing the field) passes through untouched.
  const patch = withNormalizedSiren(rawPatch);
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
                  kind: resolution.kind === 'own-domain' ? 'own' : 'vendor-hosted',
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
  // Mongoose may add its version key to the replacement object while it is
  // persisted. Keep the service return value in the strict domain shape that
  // callers validated above rather than leaking that storage metadata.
  const returned = { ...next };
  await Model.replaceOne({ prospectId }, next);
  const changedFields = Object.keys(patch).filter(
    (key) =>
      JSON.stringify(current[key as keyof Prospect]) !==
      JSON.stringify(next[key as keyof Prospect]),
  );
  await recordEvent(
    connection,
    event(prospectId, 'field-edited', { fields: changedFields }, actor),
  );
  return returned;
}

export async function setProspectStatus(
  connection: Connection,
  prospectId: string,
  status: ProspectStatus,
  actor = 'operator',
): Promise<ProspectHubDocument | null> {
  const current = await getProspectHub(connection, prospectId);
  if (!current) return null;
  if (current.status === status) return current;
  const now = new Date();
  const Model = createProspectHubModel(connection);
  await Model.updateOne({ prospectId }, { $set: { status, updatedAt: now, lastActivityAt: now } });
  await recordEvent(
    connection,
    event(prospectId, 'status-changed', { from: current.status, to: status }, actor),
  );
  return { ...current, status, updatedAt: now, lastActivityAt: now };
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
  return setProspectStatus(connection, prospectId, status, actor);
}

export class AutomaticStatusTransitionError extends Error {
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
  const primaryWebsite =
    prospect.websites.find((website) => website.primary) ?? prospect.websites[0];
  const domains = new Set<string>();
  if (primaryWebsite?.registrableDomain !== undefined) {
    domains.add(primaryWebsite.registrableDomain);
  }
  for (const email of prospect.emails) {
    const at = email.address.lastIndexOf('@');
    if (at > 0) domains.add(email.address.slice(at + 1));
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
      const at = email.address.lastIndexOf('@');
      if (at <= 0) return Promise.resolve();
      return addSuppressionEntry(connection, {
        domain: email.address.slice(at + 1),
        address: email.address,
        reasonCode: 'objection',
        reason: 'opt-out recorded on the prospect',
      });
    }),
  );
}

/** Applies a workflow status requested by an automated outcome or scan
 *  effect. Unlike setProspectStatus, this refuses terminal sibling changes
 *  and regressions so callers cannot silently overwrite a manual result. */
export async function applyAutomaticProspectStatus(
  connection: Connection,
  prospectId: string,
  status: Exclude<ProspectStatus, 'new'>,
  actor = 'automation',
): Promise<ProspectHubDocument | null> {
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;
  const decision = decideAutomaticStatus(current.status, status);
  if (!decision.allowed) throw new AutomaticStatusTransitionError(current.status, status);
  if (!decision.changed) return current;
  if (status === 'opted-out') await suppressProspect(connection, current);
  return setProspectStatus(connection, prospectId, status, actor);
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
  'auditId' | 'siteUrl' | 'kind' | 'startedAt' | 'finishedAt'
> & {
  siteSignals?: { roleContact?: { address: string; sourceUrl: string } };
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
      startedAt: 1,
      finishedAt: 1,
      'siteSignals.roleContact': 1,
    })
    .sort({ startedAt: -1 })
    .lean<ProspectAuditRow[]>();
}

export async function listDirectory(
  connection: Connection,
  filter: DirectoryFilter = {},
): Promise<Page<DirectoryEntryDocument>> {
  const [page, pageSize] = pageBounds(filter.page, filter.pageSize);
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
  const Model = createDirectoryEntryModel(connection);
  const [rows, total] = await Promise.all([
    Model.find(query)
      .sort({ name: 1, directoryId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<DirectoryEntryDocument[]>(),
    Model.countDocuments(query),
  ]);
  return { rows, page, pageSize, total };
}

export async function addDirectoryEntriesToProspects(
  connection: Connection,
  directoryIds: readonly string[],
  actor = 'operator',
): Promise<ProspectHubDocument[]> {
  if (directoryIds.length === 0) return [];
  const Directory = createDirectoryEntryModel(connection);
  const entries = await Directory.find({
    directoryId: { $in: directoryIds },
    prospectId: { $exists: false },
  }).lean<DirectoryEntry[]>();
  const created: ProspectHubDocument[] = [];
  for (const entry of entries) {
    const prospect = await createProspectHub(
      connection,
      {
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
          hotel: 'atout-france',
          websites: 'atout-france',
        },
        directoryRef: {
          source: entry.sourceRefs[0]?.source ?? 'atout-france',
          sourceId: entry.sourceRefs[0]?.sourceId ?? entry.directoryId,
        },
      },
      actor,
    );
    await Directory.updateOne(
      { directoryId: entry.directoryId },
      { $set: { prospectId: prospect.prospectId, updatedAt: new Date() } },
    );
    created.push(prospect);
  }
  return created;
}

export interface ProspectCascadeCounts extends AuditCascadeCounts {
  prospects: number;
  previews: number;
  drafts: number;
  threads: number;
  outcomes: number;
  events: number;
  jobs: number;
}

/**
 * Permanently removes one prospect and the operational material attached to
 * it. Suppression is intentionally absent: opting out is a durable safety
 * fact, not prospect-owned history.
 */
export async function deleteProspect(
  connection: Connection,
  prospectId: string,
): Promise<ProspectCascadeCounts | null> {
  const current = await getProspectHub(connection, prospectId);
  if (current === null) return null;

  const audits = await createAuditModel(connection)
    .find({ prospectId })
    .select({ auditId: 1, _id: 0 })
    .lean<{ auditId: string }[]>();
  const auditCounts = await Promise.all(
    audits.map((audit) => deleteAuditCascade(connection, audit.auditId)),
  );
  const auditTotals = auditCounts.reduce<AuditCascadeCounts>(
    (total, count) => ({
      audits: total.audits + count.audits,
      findings: total.findings + count.findings,
      analyses: total.analyses + count.analyses,
      reports: total.reports + count.reports,
      reportApprovals: total.reportApprovals + count.reportApprovals,
    }),
    { audits: 0, findings: 0, analyses: 0, reports: 0, reportApprovals: 0 },
  );

  const Thread = createOutreachThreadModel(connection);
  const threads = await Thread.find({ prospectId })
    .select({ threadId: 1, _id: 0 })
    .lean<{ threadId: string }[]>();
  const threadIds = threads.map((thread) => thread.threadId);
  const Preview = createOutreachPreviewModel(connection);
  await Preview.updateMany(
    { prospectId, status: 'live' },
    {
      $set: { status: 'revoked', revokedAt: new Date(), revokedReason: 'prospect-deleted' },
      $unset: { previewUrl: 1 },
    },
  );
  const [previews, drafts, deletedThreads, outcomes, events, jobs, prospects] = await Promise.all([
    Preview.deleteMany({ prospectId }).exec(),
    createOutreachDraftModel(connection).deleteMany({ prospectId }).exec(),
    Thread.deleteMany({ prospectId }).exec(),
    createOutreachOutcomeModel(connection)
      .deleteMany({
        $or: [
          { prospectId },
          ...(threadIds.length === 0 ? [] : [{ threadId: { $in: threadIds } }]),
        ],
      })
      .exec(),
    createProspectEventModel(connection).deleteMany({ prospectId }).exec(),
    createJobModel(connection).deleteMany({ 'options.prospectId': prospectId }).exec(),
    createProspectHubModel(connection).deleteOne({ prospectId }).exec(),
  ]);
  await createDirectoryEntryModel(connection).updateMany(
    { prospectId },
    { $unset: { prospectId: '' }, $set: { updatedAt: new Date() } },
  );

  return {
    ...auditTotals,
    prospects: prospects.deletedCount,
    previews: previews.deletedCount,
    drafts: drafts.deletedCount,
    threads: deletedThreads.deletedCount,
    outcomes: outcomes.deletedCount,
    events: events.deletedCount,
    jobs: jobs.deletedCount,
  };
}

export interface WithdrawnProspectOutreach {
  drafts: number;
  previews: number;
  threadClosed: boolean;
  /** Mailbox drafts the caller still has to delete at the provider. */
  providerDraftIds: string[];
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
  const pendingDrafts = await Drafts.find({ prospectId, status: 'created' })
    .select({ draftId: 1, providerDraftId: 1, _id: 0 })
    .lean<{ draftId: string; providerDraftId?: string }[]>();
  if (pendingDrafts.length > 0) {
    await Drafts.updateMany(
      { draftId: { $in: pendingDrafts.map((draft) => draft.draftId) }, status: 'created' },
      { $set: { status: 'deleted', deletedAt: now } },
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
    const result = await transitionOutreachThread(connection, {
      threadId: thread.threadId,
      from: ACTIVE_OUTREACH_THREAD_STATES,
      to: reason === 'opted-out' ? 'opted-out' : 'closed',
      at: now,
      reason,
    });
    threadClosed ||= result.changed;
  }

  return {
    drafts: pendingDrafts.length,
    previews: livePreviews.length,
    threadClosed,
    providerDraftIds: pendingDrafts.flatMap((draft) =>
      draft.providerDraftId === undefined ? [] : [draft.providerDraftId],
    ),
    previewObjectKeys: livePreviews.map((preview) => preview.objectKey),
  };
}

export async function recordProspectOutcome(
  connection: Connection,
  prospectId: string,
  outcome: string,
  actor = 'operator',
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
      : await applyAutomaticProspectStatus(connection, prospectId, status, actor);
  if (prospect === null) return null;
  await recordEvent(
    connection,
    event(prospectId, outcome === 'opt-out' ? 'opted-out' : 'outcome-recorded', { outcome }, actor),
  );
  return prospect;
}

export const updateProspectRecord = updateProspect;

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
  return updateProspect(connection, prospectId, fill, actor, {
    fieldOrigins: Object.fromEntries(
      fields.map((field) => [field, DETECTED_IDENTITY_ORIGIN]),
    ) as Prospect['fieldOrigins'],
  });
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
      const { createdAt, ...fields } = entry;
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
      { registrableDomain: domain, websiteKind: 'own' },
      ownCount > 1
        ? { $set: { groupStatus: 'group-member', groupDomain: domain, updatedAt: now } }
        : {
            $set: { groupStatus: 'independent', updatedAt: now },
            $unset: { groupDomain: 1 },
          },
    );
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
    fieldOrigins: { name: 'atout-france' },
    directoryRef: {
      source: entry.sourceRefs[0]?.source ?? 'atout-france',
      sourceId: entry.sourceRefs[0]?.sourceId ?? entry.directoryId,
    },
  };
}
