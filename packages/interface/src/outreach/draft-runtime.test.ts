import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  advanceThreadTouch: vi.fn(),
  attachProviderThreadId: vi.fn(),
  attachReferenceAuditDraft: vi.fn(),
  checkOutreachAction: vi.fn(),
  createAuditModel: vi.fn(),
  createJobModel: vi.fn(),
  createReferenceAuditLink: vi.fn(),
  deleteReferenceAuditLink: vi.fn(),
  effectiveAuditScanIntent: vi.fn(),
  findLiveOutreachDraft: vi.fn(),
  findOutreachPreviewByTokenHash: vi.fn(),
  findOutreachThreadByProspect: vi.fn(),
  getFindingsForAudit: vi.fn(),
  getProspectHub: vi.fn(),
  listOutreachDrafts: vi.fn(),
  openOutreachThread: vi.fn(),
  recordFailedOutreachDraft: vi.fn(),
  recordOutreachDraft: vi.fn(),
  selectNewestQualifyingAudit: vi.fn(),
  transitionOutreachThread: vi.fn(),
}));
vi.mock('../config.js', () => ({
  getOutreachReplyWindowDays: () => 14,
  getOutreachTouch2AfterDays: () => 4,
  getOutreachTouch3AfterDays: () => 7,
  getPreviewPublicBaseUrl: () => 'https://odysseus.example',
  getReferenceAuditPublicBaseUrl: () => 'https://odysseus.example',
  isReferenceAuditLinkTrackingEnabled: vi.fn(() => false),
}));
vi.mock('./configured-mailbox-draft-adapter.js', () => ({
  createConfiguredMailboxDraftAdapter: vi.fn(),
}));
vi.mock('./configured-preview-publisher.js', () => ({
  createConfiguredOptOutBucket: vi.fn(),
  createConfiguredPreviewPublisher: vi.fn(),
}));
vi.mock('./assemble-outreach-draft.js', () => ({ assembleOutreachDraft: vi.fn() }));
vi.mock('./publish-preview-v2.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publish-preview-v2.js')>()),
  resolvePublishedPreviewForDraft: vi.fn(),
}));
vi.mock('../reference-audit/reference-audit-readiness.js', () => ({
  resolveReferenceAuditForDraft: vi.fn(),
}));

import {
  advanceThreadTouch,
  attachReferenceAuditDraft,
  checkOutreachAction,
  createReferenceAuditLink,
  deleteReferenceAuditLink,
  findLiveOutreachDraft,
  findOutreachThreadByProspect,
  getProspectHub,
  listOutreachDrafts,
  openOutreachThread,
  recordFailedOutreachDraft,
  recordOutreachDraft,
  transitionOutreachThread,
} from '@odysseus/store';
import { assembleOutreachDraft } from './assemble-outreach-draft.js';
import { createConfiguredMailboxDraftAdapter } from './configured-mailbox-draft-adapter.js';
import { createConfiguredOptOutBucket } from './configured-preview-publisher.js';
import { createFollowUpForProspect, createTouchOneDraft } from './draft-runtime.js';
import {
  createInMemoryMailboxDraftAdapter,
  type InMemoryMailboxDraftAdapter,
} from './in-memory-mailbox-draft-adapter.js';
import { createInMemoryOptOutBucket, type InMemoryOptOutBucket } from './opt-out-bucket.js';
import { resolvePublishedPreviewForDraft } from './publish-preview-v2.js';
import { resolveReferenceAuditForDraft } from '../reference-audit/reference-audit-readiness.js';
import { isReferenceAuditLinkTrackingEnabled } from '../config.js';

const connection = {} as never;
const prospectId = 'prospect-1';

const prospect = {
  prospectId,
  name: 'Hôtel des Flots',
  emails: [{ address: 'contact@flots.example' }],
  websites: [{ url: 'https://flots.example/', registrableDomain: 'flots.example', primary: true }],
};

function thread(state: string, extra: Record<string, unknown> = {}) {
  return {
    threadId: 'thread-1',
    prospectId,
    domain: 'flots.example',
    roleAddress: 'contact@flots.example',
    language: 'fr',
    state,
    touches: [],
    ...extra,
  };
}

let mailbox: InMemoryMailboxDraftAdapter;
let bucket: InMemoryOptOutBucket;
let steps: string[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isReferenceAuditLinkTrackingEnabled).mockReturnValue(false);
  vi.mocked(attachReferenceAuditDraft).mockResolvedValue(undefined);
  vi.mocked(deleteReferenceAuditLink).mockResolvedValue(undefined);
  steps = [];
  mailbox = createInMemoryMailboxDraftAdapter();
  const createDraft = mailbox.createDraft.bind(mailbox);
  mailbox.createDraft = async (input) => {
    steps.push('provider-draft');
    return createDraft(input);
  };
  bucket = createInMemoryOptOutBucket();
  const putJson = bucket.putJson.bind(bucket);
  bucket.putJson = async (key, value) => {
    steps.push('opt-out-link');
    return putJson(key, value);
  };
  vi.mocked(createConfiguredMailboxDraftAdapter).mockReturnValue(mailbox);
  vi.mocked(createConfiguredOptOutBucket).mockReturnValue(bucket);

  vi.mocked(getProspectHub).mockResolvedValue(prospect as never);
  vi.mocked(checkOutreachAction).mockImplementation(async () => {
    steps.push('gate');
    return { allowed: true } as never;
  });
  vi.mocked(resolvePublishedPreviewForDraft).mockResolvedValue({
    previewId: 'preview-1',
    url: 'https://odysseus.example/apercu/token',
    distinctFindingCount: 3,
    affectedPageCount: 2,
    severityTotals: { critical: 0, serious: 1, moderate: 2, minor: 0 },
    proofCardCategories: ['accessibility'],
  } as never);
  vi.mocked(resolveReferenceAuditForDraft).mockResolvedValue({
    url: 'https://odysseus.example/exemple-audit',
    referenceVersion: 'reference-release-v1',
  });
  vi.mocked(findOutreachThreadByProspect).mockResolvedValue(null);
  vi.mocked(findLiveOutreachDraft).mockResolvedValue(null);
  vi.mocked(openOutreachThread).mockResolvedValue({
    thread: thread('open'),
    created: true,
  } as never);
  vi.mocked(assembleOutreachDraft).mockReturnValue({
    assembled: true,
    subject: 'Votre site',
    body: 'Bonjour',
    htmlBody: '<p>Bonjour</p>',
  });
  vi.mocked(recordOutreachDraft).mockImplementation(async () => {
    steps.push('record-draft');
    return { draftId: 'draft-1' } as never;
  });
});

const touchOne = (options: Record<string, unknown> = {}) =>
  createTouchOneDraft(connection, prospectId, {
    language: 'fr',
    previewToken: 'token',
    ...options,
  });

describe('createTouchOneDraft', () => {
  it('stores the opt-out link after the final gate and before the provider draft', async () => {
    const result = await touchOne();

    expect(result).toMatchObject({ configured: true, created: true, draftId: 'draft-1' });
    expect(steps).toEqual(['gate', 'gate', 'opt-out-link', 'provider-draft', 'record-draft']);
    expect(bucket.keys()).toHaveLength(1);
    expect(mailbox.recorded()).toHaveLength(1);
    expect(mailbox.recorded()[0]?.to).toBe('contact@flots.example');
    expect(transitionOutreachThread).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ threadId: 'thread-1', from: ['open'], to: 'e1-drafted' }),
    );
  });

  it('keeps the canonical link when optional attribution configuration fails open', async () => {
    vi.mocked(isReferenceAuditLinkTrackingEnabled).mockImplementation(() => {
      throw new Error('receipt configuration unavailable');
    });

    const result = await touchOne();

    expect(result).toMatchObject({
      configured: true,
      created: true,
      referenceAuditUrl: 'https://odysseus.example/exemple-audit',
    });
    expect(createReferenceAuditLink).not.toHaveBeenCalled();
  });

  it('cleans an optional attribution mapping when draft assembly refuses', async () => {
    vi.mocked(isReferenceAuditLinkTrackingEnabled).mockReturnValue(true);
    vi.mocked(assembleOutreachDraft).mockReturnValue({
      assembled: false,
      refusal: 'missing-categories',
    });

    const result = await touchOne();

    expect(result).toEqual({ configured: true, created: false, refusal: 'assembly-refused' });
    expect(deleteReferenceAuditLink).toHaveBeenCalledWith(
      connection,
      expect.stringMatching(/^[0-9a-f]{64}$/u),
    );
    expect(recordFailedOutreachDraft).toHaveBeenCalledWith(
      connection,
      expect.not.objectContaining({ referenceAuditTokenHash: expect.any(String) }),
    );
  });

  it('creates no provider draft when suppression lands between the two gates', async () => {
    vi.mocked(checkOutreachAction)
      .mockResolvedValueOnce({ allowed: true } as never)
      .mockResolvedValueOnce({ allowed: false, refusal: 'suppressed' } as never);

    const result = await touchOne();

    expect(result).toEqual({
      configured: true,
      created: false,
      refusal: 'suppressed-before-provider',
    });
    expect(mailbox.recorded()).toHaveLength(0);
    expect(bucket.keys()).toHaveLength(0);
    expect(recordOutreachDraft).not.toHaveBeenCalled();
    expect(recordFailedOutreachDraft).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ failureReason: 'suppressed-before-provider' }),
    );
  });

  it('refuses at the first gate without resolving the preview or opening a thread', async () => {
    vi.mocked(checkOutreachAction).mockResolvedValue({
      allowed: false,
      refusal: 'suppressed',
    } as never);

    expect(await touchOne()).toEqual({ configured: true, created: false, refusal: 'suppressed' });
    expect(resolvePublishedPreviewForDraft).not.toHaveBeenCalled();
    expect(openOutreachThread).not.toHaveBeenCalled();
    expect(mailbox.recorded()).toHaveLength(0);
  });

  it('refuses a terminal thread', async () => {
    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(thread('opted-out') as never);

    expect(await touchOne()).toMatchObject({ created: false, refusal: 'thread-closed' });
    expect(openOutreachThread).not.toHaveBeenCalled();
    expect(mailbox.recorded()).toHaveLength(0);
  });

  it('refuses when a first draft is already live on the thread', async () => {
    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(thread('e1-drafted') as never);
    vi.mocked(findLiveOutreachDraft).mockResolvedValue({ draftId: 'live' } as never);

    expect(await touchOne()).toMatchObject({ created: false, refusal: 'draft-already-live' });
    expect(mailbox.recorded()).toHaveLength(0);
    expect(bucket.keys()).toHaveLength(0);
  });

  it('plans a dry run without the configured mailbox, a link or a draft record', async () => {
    const result = await touchOne({ dryRun: true });

    expect(result).toMatchObject({
      configured: true,
      created: false,
      plan: { wouldDraft: true, roleAddress: 'contact@flots.example', touch: 1 },
    });
    expect(createConfiguredMailboxDraftAdapter).not.toHaveBeenCalled();
    expect(steps).toEqual(['gate']);
    expect(recordOutreachDraft).not.toHaveBeenCalled();
    expect(transitionOutreachThread).not.toHaveBeenCalled();
  });

  it('reports an unconfigured mailbox before touching the preview', async () => {
    vi.mocked(createConfiguredMailboxDraftAdapter).mockReturnValue(null);

    expect(await touchOne()).toEqual({ configured: false, refusal: 'no-mailbox-configured' });
    expect(resolvePublishedPreviewForDraft).not.toHaveBeenCalled();
  });

  it('refuses a missing preview token', async () => {
    expect(await touchOne({ previewToken: '' })).toMatchObject({
      refusal: 'preview-not-published',
    });
    expect(openOutreachThread).not.toHaveBeenCalled();
  });

  it('deletes the provider draft when recording it fails', async () => {
    vi.mocked(recordOutreachDraft).mockImplementation(async () => {
      steps.push('record-draft');
      throw new Error('mongo down');
    });

    expect(await touchOne()).toMatchObject({
      created: false,
      refusal: 'provider-draft-unrecorded',
    });
    expect(steps).toEqual(['gate', 'gate', 'opt-out-link', 'provider-draft', 'record-draft']);
    expect(mailbox.recorded()).toHaveLength(0);
    expect(transitionOutreachThread).not.toHaveBeenCalled();
  });
});

describe('createFollowUpForProspect', () => {
  beforeEach(() => {
    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(
      thread('e1-sent', { providerThreadId: 'provider-thread-1' }) as never,
    );
    vi.mocked(listOutreachDrafts).mockResolvedValue([
      { touch: 1, subject: 'Votre site', createdAt: new Date('2026-09-01') },
    ] as never);
  });

  it('drafts touch two on the same provider thread after the final gate', async () => {
    const result = await createFollowUpForProspect(connection, prospectId);

    expect(result).toMatchObject({ configured: true, created: true, draftId: 'draft-1' });
    expect(steps).toEqual(['gate', 'gate', 'provider-draft', 'record-draft']);
    expect(mailbox.recorded()[0]?.providerThreadId).toBe('provider-thread-1');
    expect(advanceThreadTouch).toHaveBeenCalledWith(connection, 'thread-1', 2);
    expect(transitionOutreachThread).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ from: ['e1-sent'], to: 'e2-drafted' }),
    );
  });

  it('creates no provider draft when suppression lands between the two gates', async () => {
    vi.mocked(checkOutreachAction)
      .mockResolvedValueOnce({ allowed: true } as never)
      .mockResolvedValueOnce({ allowed: false, refusal: 'suppressed' } as never);

    expect(await createFollowUpForProspect(connection, prospectId)).toEqual({
      configured: true,
      created: false,
      refusal: 'suppressed-before-provider',
    });
    expect(mailbox.recorded()).toHaveLength(0);
    expect(transitionOutreachThread).not.toHaveBeenCalled();
  });

  it.each(['replied', 'opted-out', 'e1-drafted', 'sequence-complete'])(
    'refuses a thread in state %s',
    async (state) => {
      vi.mocked(findOutreachThreadByProspect).mockResolvedValue(thread(state) as never);
      expect(await createFollowUpForProspect(connection, prospectId)).toMatchObject({
        created: false,
        refusal: 'thread-not-eligible',
      });
      expect(checkOutreachAction).not.toHaveBeenCalled();
      expect(mailbox.recorded()).toHaveLength(0);
    },
  );

  it('refuses when the follow-up draft is already live', async () => {
    vi.mocked(findLiveOutreachDraft).mockResolvedValue({ draftId: 'live' } as never);
    expect(await createFollowUpForProspect(connection, prospectId)).toMatchObject({
      refusal: 'draft-already-live',
    });
    expect(mailbox.recorded()).toHaveLength(0);
  });

  it('plans a dry run without drafting', async () => {
    const result = await createFollowUpForProspect(connection, prospectId, { dryRun: true });
    expect(result).toMatchObject({ created: false, plan: { wouldDraft: true, touch: 2 } });
    expect(createConfiguredMailboxDraftAdapter).not.toHaveBeenCalled();
    expect(steps).toEqual(['gate']);
  });
});
