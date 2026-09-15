import type { Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import {
  addDirectoryEntriesToProspects,
  appendProspectEvent,
  attachAuditToProspect,
  checkOutreachAction,
  createProspectHub,
  findProspectsByDomain,
  findOutreachThreadByProspect,
  getProspectHub,
  listOutreachDrafts,
  listDirectory,
  loadProspectWork,
  listProspectTodo,
  listProspectAudits,
  listProspectEvents,
  listProspects,
  listOutreachPreviews,
  deleteProspect,
  recordProspectOutcome,
  setProspectStatus,
  updateProspect,
  type DirectoryFilter,
  type NewProspectHubInput,
  type ProspectHubFilter,
} from '@odysseus/store';
import type { ProspectStatus, ProspectWebsiteKind } from '@odysseus/core';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import { readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import { getPreviewPublicBaseUrl } from '../config.js';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { createMongoOutreachPreviewStoreV2 } from '../outreach/mongo-outreach-preview-store-v2.js';
import { publishPreviewV2 } from '../outreach/publish-preview-v2.js';
import {
  createFirstEmailForProspect,
  createFollowUpForProspect,
} from '../outreach/draft-runtime.js';

const STATUSES: readonly ProspectStatus[] = [
  'new',
  'audited',
  'contacted',
  'follow-up',
  'replied',
  'call',
  'quoted',
  'won',
  'lost',
  'opted-out',
];
const WEBSITE_KINDS: readonly ProspectWebsiteKind[] = ['own', 'vendor-hosted', 'unknown'];
const GROUP_STATUSES = ['independent', 'group-member', 'vendor-hosted', 'unknown'] as const;

function optionalText(query: URLSearchParams, key: string): string | undefined {
  const value = query.get(key)?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function optionalNumber(query: URLSearchParams, key: string): number | undefined {
  const value = optionalText(query, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${key} must be a non-negative whole number`);
  return parsed;
}

function optionalBoolean(query: URLSearchParams, key: string): boolean | undefined {
  const value = optionalText(query, key);
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function filters(query: URLSearchParams): {
  prospects: ProspectHubFilter;
  directory: DirectoryFilter;
} {
  const status = optionalText(query, 'status');
  if (status !== undefined && !STATUSES.includes(status as ProspectStatus))
    throw new Error('status is invalid');
  const websiteKind = optionalText(query, 'websiteKind');
  if (websiteKind !== undefined && !WEBSITE_KINDS.includes(websiteKind as ProspectWebsiteKind))
    throw new Error('websiteKind is invalid');
  const groupStatus = optionalText(query, 'groupStatus');
  if (
    groupStatus !== undefined &&
    !GROUP_STATUSES.includes(groupStatus as (typeof GROUP_STATUSES)[number])
  )
    throw new Error('groupStatus is invalid');
  const common = {
    q: optionalText(query, 'q'),
    sector: optionalText(query, 'sector'),
    stars: optionalNumber(query, 'stars'),
    groupStatus: groupStatus as ProspectHubFilter['groupStatus'],
    websiteKind: websiteKind as ProspectWebsiteKind | undefined,
    department: optionalText(query, 'department'),
    commune: optionalText(query, 'commune'),
    roomsMin: optionalNumber(query, 'roomsMin'),
    roomsMax: optionalNumber(query, 'roomsMax'),
    hasScan: optionalBoolean(query, 'hasScan'),
    inactive: optionalBoolean(query, 'inactive'),
    page: optionalNumber(query, 'page'),
    pageSize: optionalNumber(query, 'pageSize'),
  };
  return {
    prospects: { ...common, status: status as ProspectStatus | undefined },
    directory: { ...common, postcode: optionalText(query, 'postcode') },
  };
}

function recordBody(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function languageFromBody(body: unknown): 'fr' | 'en' | null {
  if (body === undefined) return 'fr';
  const record = recordBody(body);
  if (record === null) return null;
  const language = record['language'];
  if (language === undefined) return 'fr';
  return language === 'fr' || language === 'en' ? language : null;
}

export function registerProspectHubRoutes(router: Router, connection: Connection): void {
  router.get('/api/prospect-hub/todo', async ({ res }) => {
    sendJson(res, 200, { rows: await listProspectTodo(connection) });
  });

  router.get('/api/prospect-hub/results', async ({ res, query }) => {
    try {
      sendJson(res, 200, await listProspects(connection, filters(query).prospects));
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid result filters');
    }
  });

  router.get('/api/prospects', async ({ res, query }) => {
    try {
      sendJson(res, 200, await listProspects(connection, filters(query).prospects));
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid prospect filters');
    }
  });

  router.get('/api/prospects/match', async ({ res, query }) => {
    const domain = query.get('domain')?.trim();
    if (!domain) {
      sendError(res, 400, 'domain is required');
      return;
    }
    sendJson(res, 200, await findProspectsByDomain(connection, domain));
  });

  router.post('/api/prospects', async ({ req, res }) => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    if (body === null) {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    try {
      sendJson(
        res,
        201,
        await createProspectHub(connection, body as unknown as NewProspectHubInput),
      );
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid prospect');
    }
  });

  router.get('/api/directory', async ({ res, query }) => {
    try {
      sendJson(res, 200, await listDirectory(connection, filters(query).directory));
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid directory filters');
    }
  });

  router.post('/api/directory/add', async ({ req, res }) => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    const ids = body?.['directoryIds'];
    if (
      body === null ||
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id): id is string => typeof id === 'string' && id.length > 0)
    ) {
      sendError(res, 400, 'directoryIds must be a non-empty array of ids');
      return;
    }
    sendJson(res, 201, { prospects: await addDirectoryEntriesToProspects(connection, ids) });
  });

  router.post('/api/audits/:auditId/prospect', async ({ req, res, params }) => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    const prospectId = body?.['prospectId'];
    if (prospectId !== null && typeof prospectId !== 'string') {
      sendError(res, 400, 'prospectId must be a UUID or null');
      return;
    }
    const audit = await attachAuditToProspect(connection, params['auditId']!, prospectId);
    if (audit === null) sendError(res, 404, 'audit or prospect not found');
    else sendJson(res, 200, audit);
  });

  router.get('/api/prospects/:prospectId/events', async ({ res, params }) => {
    sendJson(res, 200, await listProspectEvents(connection, params['prospectId']!));
  });

  router.get('/api/prospects/:prospectId/actionability', async ({ res, params, query }) => {
    const prospect = await getProspectHub(connection, params['prospectId']!);
    if (prospect === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    const requested = query.get('action');
    const actions = requested === null ? ['preview', 'first-email', 'follow-up'] : [requested];
    if (
      !actions.every(
        (action) => action === 'preview' || action === 'first-email' || action === 'follow-up',
      )
    ) {
      sendError(res, 400, 'action must be preview, first-email, or follow-up');
      return;
    }
    const checks = await Promise.all(
      actions.map(
        async (action) =>
          [
            action,
            await checkOutreachAction(connection, {
              prospect,
              action: action as 'preview' | 'first-email' | 'follow-up',
            }),
          ] as const,
      ),
    );
    const result: Record<string, { state: 'available' | 'blocked'; reason?: string }> = {};
    for (const [action, check] of checks) {
      result[action] = check.allowed
        ? { state: 'available' }
        : { state: 'blocked', reason: check.refusal };
    }
    sendJson(res, 200, requested === null ? { actions: result } : result[requested]);
  });

  router.get('/api/prospects/:prospectId', async ({ res, params }) => {
    const prospect = await getProspectHub(connection, params['prospectId']!);
    if (prospect === null) sendError(res, 404, 'prospect not found');
    else {
      const [work, thread, drafts] = await Promise.all([
        loadProspectWork(connection, [prospect]),
        findOutreachThreadByProspect(connection, prospect.prospectId),
        listOutreachDrafts(connection, { prospectId: prospect.prospectId, limit: 20 }),
      ]);
      sendJson(res, 200, {
        ...prospect,
        audits: await listProspectAudits(connection, prospect.prospectId),
        events: await listProspectEvents(connection, prospect.prospectId),
        previews: (
          await listOutreachPreviews(connection, {
            prospectId: prospect.prospectId,
            limit: 20,
          })
        ).map((preview) => ({
          previewId: preview.previewId,
          status: preview.status,
          publishedAt: preview.publishedAt,
          publicExpiresAt: preview.publicExpiresAt,
          revokedAt: preview.revokedAt,
          revokedReason: preview.revokedReason,
        })),
        work: {
          items: work[0]?.items ?? [],
          recommendation: work[0]?.recommendation,
          auditState: work[0]?.auditState ?? 'missing',
          qualifyingAuditId: work[0]?.qualifyingAudit?.auditId,
          websiteSuppressed: work[0]?.websiteSuppressed ?? false,
          emailSuppressed: work[0]?.emailSuppressed ?? false,
        },
        thread:
          thread === null
            ? null
            : {
                threadId: thread.threadId,
                state: thread.state,
                currentTouch: thread.currentTouch,
                updatedAt: thread.updatedAt,
                needsReview: thread.needsReview,
              },
        drafts: drafts.map((draft) => ({
          draftId: draft.draftId,
          touch: draft.touch,
          status: draft.status,
          subject: draft.subject,
          previewUrl: draft.previewUrl,
          createdAt: draft.createdAt,
        })),
      });
    }
  });

  router.post('/api/prospects/:prospectId/outreach/first-email', async ({ req, res, params }) => {
    const prospect = await getProspectHub(connection, params['prospectId']!);
    if (prospect === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    const language = languageFromBody(await readJsonBodyOrRespond(req, res));
    if (language === null) {
      sendError(res, 400, 'language must be fr or en');
      return;
    }
    const allowed = await checkOutreachAction(connection, { prospect, action: 'first-email' });
    if (!allowed.allowed) {
      sendJson(res, 200, { created: false, refusal: allowed.refusal });
      return;
    }
    const result = await createFirstEmailForProspect(connection, prospect.prospectId, { language });
    if (!result.configured) {
      sendJson(res, 503, result);
      return;
    }
    res.setHeader('cache-control', 'no-store');
    sendJson(res, 200, result);
  });

  router.post('/api/prospects/:prospectId/outreach/follow-up', async ({ res, params }) => {
    const prospect = await getProspectHub(connection, params['prospectId']!);
    if (prospect === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    const allowed = await checkOutreachAction(connection, { prospect, action: 'follow-up' });
    if (!allowed.allowed) {
      sendJson(res, 200, { created: false, refusal: allowed.refusal });
      return;
    }
    const result = await createFollowUpForProspect(connection, prospect.prospectId);
    if (!result.configured) {
      sendJson(res, 503, result);
      return;
    }
    res.setHeader('cache-control', 'no-store');
    sendJson(res, 200, result);
  });

  router.post('/api/prospects/:prospectId/preview/publish', async ({ res, params }) => {
    const prospect = await getProspectHub(connection, params['prospectId']!);
    if (prospect === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    const allowed = await checkOutreachAction(connection, { prospect, action: 'preview' });
    if (!allowed.allowed) {
      sendJson(res, 200, { published: false, refusal: allowed.refusal });
      return;
    }
    let publisher;
    try {
      publisher = createConfiguredPreviewPublisher();
    } catch {
      sendError(res, 503, 'the preview bucket is not configured on this machine');
      return;
    }
    const result = await publishPreviewV2({
      store: createMongoOutreachPreviewStoreV2(connection, {
        qualificationVersion: 'prospect-hub',
        prospectId: prospect.prospectId,
      }),
      publisher,
      publicBaseUrl: getPreviewPublicBaseUrl(),
      prospectId: prospect.prospectId,
      language: 'fr',
      dryRun: false,
    });
    if (result.published) {
      await appendProspectEvent(connection, {
        eventId: randomUUID(),
        prospectId: prospect.prospectId,
        type: 'preview-published',
        payload: { previewId: result.previewId },
        actor: 'operator',
        at: new Date(),
      });
    }
    res.setHeader('cache-control', 'no-store');
    sendJson(res, 200, result);
  });

  router.patch('/api/prospects/:prospectId', async ({ req, res, params }) => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    if (body === null) {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    if ('status' in body) {
      sendError(res, 400, 'use the status endpoint to change status');
      return;
    }
    const prospect = await updateProspect(connection, params['prospectId']!, body as never);
    if (prospect === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, prospect);
  });

  router.patch('/api/prospects/:prospectId/status', async ({ req, res, params }) => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    const status = body?.['status'];
    if (typeof status !== 'string' || !STATUSES.includes(status as ProspectStatus)) {
      sendError(res, 400, 'status is invalid');
      return;
    }
    const prospect = await setProspectStatus(
      connection,
      params['prospectId']!,
      status as ProspectStatus,
    );
    if (prospect === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, prospect);
  });

  router.post('/api/prospects/:prospectId/outcome', async ({ req, res, params }) => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    const outcome = body?.['outcome'];
    if (
      typeof outcome !== 'string' ||
      ![
        'no-reply',
        'reply-positive',
        'reply-not-now',
        'reply-negative',
        'opt-out',
        'call',
        'quoted',
        'won',
        'lost',
      ].includes(outcome)
    ) {
      sendError(res, 400, 'outcome is invalid');
      return;
    }
    const prospect = await recordProspectOutcome(connection, params['prospectId']!, outcome);
    if (prospect === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, prospect);
  });

  router.delete('/api/prospects/:prospectId', async ({ res, params }) => {
    const prospectId = params['prospectId']!;
    const [audits, livePreviews] = await Promise.all([
      listProspectAudits(connection, prospectId),
      listOutreachPreviews(connection, { prospectId, status: 'live' }),
    ]);

    try {
      const auditDirs = audits.map((audit) =>
        buildAuditDir(getArtifactsRoot(), new URL(audit.siteUrl).hostname, audit.startedAt),
      );
      const publisher = livePreviews.length > 0 ? createConfiguredPreviewPublisher() : undefined;
      await Promise.all([
        ...auditDirs.map((auditDir) => fs.rm(auditDir, { recursive: true, force: true })),
        ...(publisher === undefined
          ? []
          : livePreviews.map((preview) => publisher.delete(preview.objectKey))),
      ]);
    } catch {
      sendError(res, 503, 'prospect artifacts or previews could not be removed');
      return;
    }

    const deleted = await deleteProspect(connection, prospectId);
    if (deleted === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, deleted);
  });
}
