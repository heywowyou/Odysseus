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
  isSuppressed,
  listOutreachDrafts,
  listDirectory,
  loadProspectWork,
  listProspectTodo,
  listProspectAudits,
  listProspectEvents,
  listProspects,
  listOutreachPreviews,
  archiveProspect,
  countProspectDeletionImpact,
  deleteProspectPermanently,
  restoreProspect,
  recordOutreachDraftReview,
  revokeOutreachPreview,
  recordProspectOutcome,
  removeProspectEmail,
  removeProspectWebsite,
  setOutreachProspectEmail,
  setPrimaryProspectWebsite,
  setProspectStatus,
  isEditableProspectField,
  updateProspect,
  type DirectoryFilter,
  type NewProspectHubInput,
  type ProspectHubFilter,
} from '@odysseus/store';
import type { ProspectPatch } from '@odysseus/store';
import type { ProspectStatus, ProspectWebsiteKind } from '@odysseus/core';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import { readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import { getPreviewPublicBaseUrl } from '../config.js';
import { createConfiguredMailboxDraftAdapter } from '../outreach/configured-mailbox-draft-adapter.js';
import { createConfiguredPreviewPublisher } from '../outreach/configured-preview-publisher.js';
import { createMongoOutreachPreviewStoreV2 } from '../outreach/mongo-outreach-preview-store-v2.js';
import { publishPreviewV2 } from '../outreach/publish-preview-v2.js';
import { syncMailbox } from '../outreach/mailbox-sync.js';
import { withdrawOutreachForProspect } from '../outreach/withdraw-prospect-outreach.js';
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
  const view = optionalText(query, 'view');
  if (view !== undefined && view !== 'all' && view !== 'results')
    throw new Error('view is invalid');
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
    prospects: {
      ...common,
      view: (view as ProspectHubFilter['view']) ?? 'all',
      status: status as ProspectStatus | undefined,
      archived: optionalBoolean(query, 'archived'),
    },
    directory: { ...common, postcode: optionalText(query, 'postcode') },
  };
}

function recordBody(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Issue #275: an explicit request language wins; otherwise the prospect's
 *  own outreach language, French by default. */
function languageFromBody(body: unknown, fallback: 'fr' | 'en'): 'fr' | 'en' | null {
  if (body === undefined) return fallback;
  const record = recordBody(body);
  if (record === null) return null;
  const language = record['language'];
  if (language === undefined) return fallback;
  return language === 'fr' || language === 'en' ? language : null;
}

export function registerProspectHubRoutes(router: Router, connection: Connection): void {
  router.get('/api/prospect-hub/todo', async ({ res }) => {
    sendJson(res, 200, { rows: await listProspectTodo(connection) });
  });

  // Check one entered address against suppression. Hashing happens inside
  // isSuppressed, so the entered value exists only in this call's memory:
  // nothing is persisted, echoed, or listed.
  router.post('/api/outreach/suppression-check', async ({ req, res }) => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    if (res.headersSent) return;
    const raw = body?.['address'];
    if (typeof raw !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) {
      sendError(res, 400, 'address must be a valid email address');
      return;
    }
    const address = raw.trim();
    const domain = address.slice(address.indexOf('@') + 1);
    sendJson(res, 200, { suppressed: await isSuppressed(connection, domain, address) });
  });

  // Issue #272: the operator can pull sent emails and replies in now rather
  // than wait for the scheduled sync.
  router.post('/api/outreach/mailbox-sync', async ({ res }) => {
    const result = await syncMailbox(connection);
    sendJson(res, result.configured ? 200 : 503, result);
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
      const audits = await listProspectAudits(connection, prospect.prospectId);
      // The newest scan that read a role address on the site's own domain;
      // offered only while the prospect does not already carry it.
      const roleContact = audits.find((audit) => audit.siteSignals?.roleContact !== undefined)
        ?.siteSignals?.roleContact;
      const contactSuggestion =
        roleContact === undefined ||
        prospect.emails.some((item) => item.address.toLowerCase() === roleContact.address)
          ? null
          : roleContact;
      sendJson(res, 200, {
        ...prospect,
        audits: audits.map(({ siteSignals: _siteSignals, ...audit }) => audit),
        contactSuggestion,
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
          // Live rows keep their link (issue #288); older rows fall back to
          // the draft that carried the preview. Revoked rows expose none.
          url:
            preview.status === 'live'
              ? (preview.previewUrl ??
                drafts.find((draft) => draft.previewId === preview.previewId)?.previewUrl)
              : undefined,
        })),
        work: {
          items: work[0]?.items ?? [],
          recommendation: work[0]?.recommendation,
          auditState: work[0]?.auditState ?? 'missing',
          qualifyingAuditId: work[0]?.qualifyingAudit?.auditId,
          dataVersionState: work[0]?.dataVersionState,
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
          body: draft.body,
          recipient: draft.roleAddress,
          language: draft.language,
          previewUrl: draft.previewUrl,
          // Issue #277: Gmail opens a draft from its message id.
          mailboxUrl:
            draft.providerMessageId === undefined
              ? undefined
              : `https://mail.google.com/mail/#drafts?compose=${encodeURIComponent(draft.providerMessageId)}`,
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
    const body = await readJsonBodyOrRespond(req, res);
    const language = languageFromBody(body, prospect.outreachLanguage ?? 'fr');
    const previewToken = recordBody(body)?.['previewToken'];
    if (language === null) {
      sendError(res, 400, 'language must be fr or en');
      return;
    }
    const allowed = await checkOutreachAction(connection, { prospect, action: 'first-email' });
    if (!allowed.allowed) {
      sendJson(res, 200, { created: false, refusal: allowed.refusal });
      return;
    }
    const result = await createFirstEmailForProspect(connection, prospect.prospectId, {
      language,
      ...(typeof previewToken === 'string' && previewToken !== '' ? { previewToken } : {}),
    });
    if (!result.configured) {
      sendJson(res, 503, result);
      return;
    }
    res.setHeader('cache-control', 'no-store');
    sendJson(res, 200, result);
  });

  // Issue #277: discarding a draft from the dashboard withdraws it from the
  // mailbox too, so the operator can safely recreate it.
  router.post('/api/prospects/:prospectId/drafts/:draftId/discard', async ({ res, params }) => {
    const drafts = await listOutreachDrafts(connection, {
      prospectId: params['prospectId']!,
      status: 'created',
    });
    const draft = drafts.find((item) => item.draftId === params['draftId']);
    if (draft === undefined) {
      sendError(res, 404, 'pending draft not found');
      return;
    }
    await recordOutreachDraftReview(connection, draft.draftId, 'skipped');
    const mailbox = createConfiguredMailboxDraftAdapter();
    if (mailbox !== null && draft.providerDraftId !== undefined) {
      await mailbox.deleteDraft(draft.providerDraftId).catch(() => undefined);
    }
    sendJson(res, 200, { discarded: true });
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

  // Issue #280: the operator can take a live preview offline from the hub.
  // Object first, record second, as in every other revocation.
  router.post('/api/prospects/:prospectId/previews/:previewId/revoke', async ({ res, params }) => {
    const previews = await listOutreachPreviews(connection, {
      prospectId: params['prospectId']!,
      status: 'live',
    });
    const preview = previews.find((item) => item.previewId === params['previewId']);
    if (preview === undefined) {
      sendError(res, 404, 'live preview not found');
      return;
    }
    try {
      await createConfiguredPreviewPublisher().delete(preview.objectKey);
    } catch {
      sendError(res, 503, 'the preview could not be removed from the bucket');
      return;
    }
    await revokeOutreachPreview(connection, preview.previewId, 'revoked by the operator');
    sendJson(res, 200, { revoked: true });
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
      language: prospect.outreachLanguage ?? 'fr',
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
    if ('archivedAt' in body) {
      sendError(res, 400, 'use the archive and restore endpoints to change the archive state');
      return;
    }
    const refused = Object.keys(body).filter((key) => !isEditableProspectField(key));
    if (refused.length > 0) {
      sendError(res, 400, `these fields cannot be edited here: ${refused.join(', ')}`);
      return;
    }
    try {
      const prospect = await updateProspect(
        connection,
        params['prospectId']!,
        body as ProspectPatch,
      );
      if (prospect === null) sendError(res, 404, 'prospect not found');
      else sendJson(res, 200, prospect);
    } catch (error) {
      // Issue #289: an invalid patch (a SIREN that fails the 9-digit
      // checksum, for instance) is a client error, not a server one.
      sendError(res, 400, error instanceof Error ? error.message : 'invalid prospect patch');
    }
  });

  // Issues #270/#271: explicit contact corrections, so the server enforces a
  // single primary website and the outreach recipient order.
  const contactBody = async (
    req: Parameters<typeof readJsonBodyOrRespond>[0],
    res: Parameters<typeof sendError>[0],
    key: 'url' | 'address',
  ): Promise<{ value: string; body: Record<string, unknown> } | null> => {
    const body = recordBody(await readJsonBodyOrRespond(req, res));
    const value = body?.[key];
    if (body === null || typeof value !== 'string' || value.trim() === '') {
      if (!res.headersSent) sendError(res, 400, `${key} is required`);
      return null;
    }
    return { value, body };
  };
  const sendContactResult = (
    res: Parameters<typeof sendError>[0],
    result: Awaited<ReturnType<typeof removeProspectWebsite>>,
  ): void => {
    if (result.ok) sendJson(res, 200, result.prospect);
    else if (result.refusal === 'prospect-not-found') sendError(res, 404, 'prospect not found');
    else sendError(res, 404, 'contact not found on this prospect');
  };

  router.delete('/api/prospects/:prospectId/websites', async ({ req, res, params }) => {
    const input = await contactBody(req, res, 'url');
    if (input === null) return;
    sendContactResult(
      res,
      await removeProspectWebsite(connection, params['prospectId']!, input.value),
    );
  });

  router.post('/api/prospects/:prospectId/websites/primary', async ({ req, res, params }) => {
    const input = await contactBody(req, res, 'url');
    if (input === null) return;
    sendContactResult(
      res,
      await setPrimaryProspectWebsite(connection, params['prospectId']!, input.value),
    );
  });

  router.delete('/api/prospects/:prospectId/emails', async ({ req, res, params }) => {
    const input = await contactBody(req, res, 'address');
    if (input === null) return;
    const result = await removeProspectEmail(connection, params['prospectId']!, input.value, {
      suppress: input.body['suppress'] === true,
    });
    if (result.ok && result.withdrawnProviderDraftIds.length > 0) {
      // Best effort: the stored draft is already withdrawn from review.
      const mailbox = createConfiguredMailboxDraftAdapter();
      if (mailbox !== null) {
        await Promise.all(
          result.withdrawnProviderDraftIds.map((id) =>
            mailbox.deleteDraft(id).catch(() => undefined),
          ),
        );
      }
    }
    sendContactResult(res, result);
  });

  router.post('/api/prospects/:prospectId/emails/primary', async ({ req, res, params }) => {
    const input = await contactBody(req, res, 'address');
    if (input === null) return;
    sendContactResult(
      res,
      await setOutreachProspectEmail(connection, params['prospectId']!, input.value),
    );
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
    // Issue #278: a reply outcome describes an email that was sent. Refuse it
    // until the mailbox has confirmed a send, instead of storing nonsense.
    if (['no-reply', 'reply-positive', 'reply-not-now', 'reply-negative'].includes(outcome)) {
      const thread = await findOutreachThreadByProspect(connection, params['prospectId']!);
      if (thread === null || thread.touches.length === 0) {
        sendJson(res, 409, {
          error: 'nothing has been sent to this prospect yet',
          refusal: 'nothing-sent',
        });
        return;
      }
    }
    try {
      const prospect = await recordProspectOutcome(connection, params['prospectId']!, outcome);
      if (prospect === null) {
        sendError(res, 404, 'prospect not found');
        return;
      }
      if (outcome !== 'opt-out') {
        sendJson(res, 200, prospect);
        return;
      }
      // Issue #273: an opt-out also takes pending drafts, live previews and
      // the thread out of circulation, and tells the operator what went.
      let withdrawn;
      try {
        withdrawn = await withdrawOutreachForProspect(
          connection,
          prospect.prospectId,
          'opted-out',
          {
            publisher: createConfiguredPreviewPublisher,
            mailbox: createConfiguredMailboxDraftAdapter(),
          },
        );
      } catch {
        sendError(res, 503, 'the opt-out was saved but live previews could not be removed');
        return;
      }
      sendJson(res, 200, { ...prospect, withdrawn });
    } catch (error) {
      if (error instanceof Error && error.name === 'AutomaticStatusTransitionError') {
        sendError(res, 409, error.message);
        return;
      }
      throw error;
    }
  });

  // Plan 050: archive is the ordinary way to take a prospect out of active
  // work. It keeps every attached record and the directory link, and never
  // withdraws outreach or touches artifacts; both calls are idempotent.
  router.post('/api/prospects/:prospectId/archive', async ({ res, params }) => {
    const result = await archiveProspect(connection, params['prospectId']!);
    if (result === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, result);
  });

  router.post('/api/prospects/:prospectId/restore', async ({ res, params }) => {
    const result = await restoreProspect(connection, params['prospectId']!);
    if (result === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, result);
  });

  router.get('/api/prospects/:prospectId/deletion-impact', async ({ res, params }) => {
    const impact = await countProspectDeletionImpact(connection, params['prospectId']!);
    if (impact === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, impact);
  });

  // Permanent deletion is the exceptional path (duplicates, test records,
  // bad imports). The dashboard asks for it only behind an impact summary.
  router.delete('/api/prospects/:prospectId', async ({ res, params }) => {
    const prospectId = params['prospectId']!;
    const audits = await listProspectAudits(connection, prospectId);

    try {
      const auditDirs = audits.map((audit) =>
        buildAuditDir(getArtifactsRoot(), new URL(audit.siteUrl).hostname, audit.startedAt),
      );
      await Promise.all(
        auditDirs.map((auditDir) => fs.rm(auditDir, { recursive: true, force: true })),
      );
      // Issue #273: the mailbox draft is withdrawn too, not orphaned.
      await withdrawOutreachForProspect(connection, prospectId, 'prospect-deleted', {
        publisher: createConfiguredPreviewPublisher,
        mailbox: createConfiguredMailboxDraftAdapter(),
      });
    } catch {
      sendError(res, 503, 'prospect artifacts or previews could not be removed');
      return;
    }

    const deleted = await deleteProspectPermanently(connection, prospectId);
    if (deleted === null) sendError(res, 404, 'prospect not found');
    else sendJson(res, 200, deleted);
  });
}
