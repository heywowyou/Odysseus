import { describe, expect, it } from 'vitest';
import { HUB_STEP_ANCHORS, HUB_STEP_KEYS, hubPrimaryAction, pipelineSteps } from './hub-model';
import type { ProspectDetailResponse } from './prospects-model';

/** A hub payload at the very start of the pipeline: known identity, no
 *  scan allowed yet, nothing composed. Each test pushes one stage
 *  forward. */
function makeDetail(overrides: Partial<ProspectDetailResponse> = {}): ProspectDetailResponse {
  return {
    candidateId: 'cand-1',
    resolutionVersion: 'v1',
    identityKey: 'key-1',
    identityStatus: 'resolved',
    matchedOn: null,
    siret: null,
    siren: null,
    name: 'Hôtel Exemple',
    commune: 'Grenoble',
    postcode: '38000',
    starRating: 3,
    roomCount: 42,
    capacity: 90,
    campaignEligibility: 'eligible',
    groupStatus: 'independent',
    groupDomain: null,
    groupSize: null,
    ownRegistrableDomain: 'exemple.fr',
    domainProvenance: 'declared',
    declaredRegistrableDomain: 'exemple.fr',
    reviewState: 'not-required',
    review: { queuedReason: null, actor: null, reason: null, decidedAt: null },
    qualificationOutcome: 'qualified',
    prescanStatus: null,
    websites: [],
    conflicts: [],
    sourceRefs: [],
    qualification: null,
    qualificationHistory: { rows: [], total: 0, limit: 10, offset: 0 },
    prescan: null,
    score: null,
    evidence: null,
    preview: null,
    contact: null,
    thread: null,
    outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
    outreachScan: { canStart: false },
    outreachAudit: null,
    outreachScanJobId: null,
    ...overrides,
  };
}

const NOW = Date.parse('2026-09-12T00:00:00.000Z');
const LIVE_PREVIEW = {
  previewId: 'preview-1',
  name: 'Hôtel Exemple',
  commune: null,
  postcode: null,
  domain: 'exemple.fr',
  language: 'fr' as const,
  status: 'live' as const,
  publishedAt: '2026-09-01T09:00:00.000Z',
  publicExpiresAt: '2099-01-01T00:00:00.000Z',
  revokedAt: null,
  revokedReason: null,
  prescanVersion: null,
  evidenceVersion: null,
  previewContentVersion: 'v2',
  sourceKind: 'full-audit' as const,
};

function threadWith(overrides: {
  state?: string;
  needsReview?: { reason: string; detectedAt: string } | null;
  currentOutcome?: { outcome: string; lostReason: string | null; recordedAt: string } | null;
  drafts?: {
    draftId: string;
    touch: number;
    language: 'fr' | 'en';
    status: 'created' | 'deleted' | 'failed';
    touch1EvidenceSlot: null;
    failureReason: null;
    hasProviderDraft: boolean;
    createdAt: string;
    deletedAt: null;
    reviewOutcome: null;
    reviewedAt: null;
  }[];
}): NonNullable<ProspectDetailResponse['thread']> {
  return {
    threadId: 'thread-1',
    candidateId: 'cand-1',
    domain: 'exemple.fr',
    language: 'fr',
    languageSource: 'operator',
    currentTouch: 1,
    state: overrides.state ?? 'open',
    stateEnteredAt: '2026-09-02T08:00:00.000Z',
    stateReason: null,
    touches: [],
    lastSyncedAt: null,
    needsReview: overrides.needsReview ?? null,
    currentOutcome: overrides.currentOutcome ?? null,
    drafts: overrides.drafts ?? [],
  };
}

describe('pipelineSteps', () => {
  it('orders the six stages the IA fixes', () => {
    expect(HUB_STEP_KEYS).toEqual([
      'fiche',
      'quick-check',
      'audit',
      'preview',
      'emails',
      'outcome',
    ]);
    for (const key of HUB_STEP_KEYS) {
      expect(HUB_STEP_ANCHORS[key]).toMatch(/^hub-/);
    }
  });

  it('shows an untouched prospect as review-free but todo everywhere', () => {
    const steps = pipelineSteps(makeDetail(), NOW);
    expect(steps.map((step) => step.state)).toEqual([
      'done',
      'todo',
      'todo',
      'todo',
      'todo',
      'todo',
    ]);
  });

  it('marks the fiche active while the identity review is pending', () => {
    const steps = pipelineSteps(makeDetail({ reviewState: 'pending' }), NOW);
    expect(steps[0]).toEqual({ key: 'fiche', state: 'active', date: null });
  });

  it('marks the audit blocked on a terminal refusal and active while a scan runs', () => {
    const refused = pipelineSteps(
      makeDetail({ outreachScan: { canStart: false, refusal: 'not-selected' } }),
      NOW,
    );
    expect(refused[2]).toMatchObject({ key: 'audit', state: 'blocked' });

    const running = pipelineSteps(makeDetail({ outreachScanJobId: 'job-1' }), NOW);
    expect(running[2]).toMatchObject({ key: 'audit', state: 'active' });
  });

  it('marks the preview active once an audit exists but is done while live', () => {
    const withAudit = pipelineSteps(
      makeDetail({
        outreachAudit: {
          auditId: 'audit-1',
          startedAt: '2026-09-01T10:00:00.000Z',
          severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        },
      }),
      NOW,
    );
    expect(withAudit[3]).toMatchObject({ key: 'preview', state: 'active' });

    const live = pipelineSteps(makeDetail({ preview: LIVE_PREVIEW }), NOW);
    expect(live[3]).toMatchObject({ key: 'preview', state: 'done' });
  });

  it('reads the emails step from the thread state and the outcome step from the pointer', () => {
    const steps = pipelineSteps(
      makeDetail({
        thread: threadWith({
          state: 'replied',
          needsReview: { reason: 'reply-detected', detectedAt: '2026-09-03T08:00:00.000Z' },
        }),
      }),
      NOW,
    );
    expect(steps[4]).toMatchObject({ key: 'emails', state: 'done', threadState: 'replied' });
    expect(steps[5]).toMatchObject({ key: 'outcome', state: 'active' });

    const recorded = pipelineSteps(
      makeDetail({
        thread: threadWith({
          currentOutcome: {
            outcome: 'won',
            lostReason: null,
            recordedAt: '2026-09-04T08:00:00.000Z',
          },
        }),
      }),
      NOW,
    );
    expect(recorded[5]).toMatchObject({ key: 'outcome', state: 'done' });
  });
});

describe('hubPrimaryAction', () => {
  it('walks the IA ladder from the identity review down', () => {
    expect(hubPrimaryAction(makeDetail({ reviewState: 'pending' }), NOW)).toEqual({
      kind: 'review',
    });
  });

  it('offers the scan start when the plan allows and progress while one runs', () => {
    expect(hubPrimaryAction(makeDetail({ outreachScan: { canStart: true } }), NOW)).toEqual({
      kind: 'start-scan',
    });
    expect(hubPrimaryAction(makeDetail({ outreachScanJobId: 'job-9' }), NOW)).toEqual({
      kind: 'see-progress',
      jobId: 'job-9',
    });
  });

  it('publishes when an audit has no live preview, including a reissue after expiry', () => {
    const detail = makeDetail({
      outreachAudit: {
        auditId: 'audit-1',
        startedAt: '2026-09-01T10:00:00.000Z',
        severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      },
    });
    expect(hubPrimaryAction(detail, NOW)).toEqual({ kind: 'publish-preview' });

    const expired = makeDetail({
      outreachAudit: {
        auditId: 'audit-1',
        startedAt: '2026-09-01T10:00:00.000Z',
        severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      },
      preview: {
        ...LIVE_PREVIEW,
        status: 'live',
        publicExpiresAt: '2026-09-02T00:00:00.000Z',
      },
    });
    expect(hubPrimaryAction(expired, NOW)).toEqual({ kind: 'publish-preview' });

    const revoked = makeDetail({
      preview: { ...LIVE_PREVIEW, status: 'revoked' },
      outreachAudit: {
        auditId: 'audit-1',
        startedAt: '2026-09-01T10:00:00.000Z',
        severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      },
    });
    expect(hubPrimaryAction(revoked, NOW)).toEqual({ kind: 'publish-preview' });
  });

  it('creates the first email on a live preview with no thread, reviews a created draft next', () => {
    const live = makeDetail({ preview: LIVE_PREVIEW });
    expect(hubPrimaryAction(live, NOW)).toEqual({ kind: 'create-first-email' });

    const drafted = makeDetail({
      preview: LIVE_PREVIEW,
      thread: threadWith({
        state: 'e1-drafted',
        drafts: [
          {
            draftId: 'draft-1',
            touch: 1,
            language: 'fr',
            status: 'created',
            touch1EvidenceSlot: null,
            failureReason: null,
            hasProviderDraft: true,
            createdAt: '2026-09-02T08:00:00.000Z',
            deletedAt: null,
            reviewOutcome: null,
            reviewedAt: null,
          },
        ],
      }),
    });
    expect(hubPrimaryAction(drafted, NOW)).toEqual({ kind: 'review-draft', draftId: 'draft-1' });
  });

  it('prepares a follow-up after a sent touch and records an outcome on a reply', () => {
    const sent = makeDetail({ thread: threadWith({ state: 'e1-sent' }) });
    expect(hubPrimaryAction(sent, NOW)).toEqual({ kind: 'prepare-follow-up' });

    const replied = makeDetail({
      thread: threadWith({
        state: 'replied',
        needsReview: { reason: 'reply-detected', detectedAt: '2026-09-03T08:00:00.000Z' },
      }),
    });
    expect(hubPrimaryAction(replied, NOW)).toEqual({ kind: 'record-outcome' });
  });

  it('explains a terminal refusal only when nothing later in the pipeline needs work', () => {
    expect(
      hubPrimaryAction(
        makeDetail({ outreachScan: { canStart: false, refusal: 'suppressed' } }),
        NOW,
      ),
    ).toEqual({ kind: 'scan-refused', refusal: 'suppressed' });

    // A stale selection must not hide a publishable audit behind the
    // refusal explanation: the audit stage wins.
    const staleButAudited = makeDetail({
      outreachScan: { canStart: false, refusal: 'not-selected' },
      outreachAudit: {
        auditId: 'audit-1',
        startedAt: '2026-09-01T10:00:00.000Z',
        severityRollup: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      },
    });
    expect(hubPrimaryAction(staleButAudited, NOW)).toEqual({ kind: 'publish-preview' });
  });

  it('answers none for a settled pipeline', () => {
    const settled = makeDetail({
      thread: threadWith({
        state: 'sequence-complete',
        currentOutcome: {
          outcome: 'won',
          lostReason: null,
          recordedAt: '2026-09-04T08:00:00.000Z',
        },
      }),
      preview: LIVE_PREVIEW,
    });
    expect(hubPrimaryAction(settled, NOW)).toEqual({ kind: 'none' });
  });
});
