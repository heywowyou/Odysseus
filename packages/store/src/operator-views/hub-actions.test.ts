import { describe, expect, it } from 'vitest';
import type { ProspectActiveJob } from '../active-jobs.js';
import { computeHubActions, type ComputeHubActionsInput } from './hub-actions.js';
import type { OperatorProspectDetail } from './prospect-detail.js';

function makeDetail(overrides: Partial<OperatorProspectDetail> = {}): OperatorProspectDetail {
  return {
    candidateId: 'cand-1',
    businessId: null,
    resolutionVersion: 'v1',
    identityKey: 'key-1',
    identityStatus: 'resolved',
    matchedOn: null,
    siret: null,
    siren: null,
    name: 'Hotel Exemple',
    commune: 'Paris',
    postcode: '75001',
    starRating: 3,
    roomCount: null,
    capacity: null,
    campaignEligibility: 'eligible',
    groupStatus: 'independent',
    groupDomain: null,
    groupSize: null,
    ownRegistrableDomain: 'hotel-exemple.fr',
    domainProvenance: null,
    declaredRegistrableDomain: null,
    reviewState: 'accepted',
    review: { queuedReason: null, actor: null, reason: null, decidedAt: null },
    qualificationOutcome: 'qualified',
    qualificationFreshness: {
      state: 'current',
      version: 'v1',
      computedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    prescanStatus: 'complete',
    prescanFreshness: {
      state: 'current',
      version: 'v1',
      computedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    scoreFreshness: {
      state: 'current',
      version: 'v1',
      computedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    websites: [],
    conflicts: [],
    sourceRefs: [],
    qualification: null,
    prescan: null,
    evidence: null,
    score: null,
    contact: null,
    thread: null,
    preview: null,
    outcomes: { rows: [], total: 0, limit: 10, offset: 0 },
    ...overrides,
  };
}

function makeActiveJob(overrides: Partial<ProspectActiveJob> = {}): ProspectActiveJob {
  return {
    jobId: 'job-1',
    kind: 'quick-check',
    status: 'running',
    startedAt: new Date('2026-09-01T00:00:00.000Z'),
    targetDomain: 'hotel-exemple.fr',
    ...overrides,
  };
}

const BASE_INPUT: ComputeHubActionsInput = {
  detail: makeDetail(),
  activeJobs: [],
  outreachScanPlan: {},
  fullAuditPlan: { canStart: true },
  quickCheckPlan: { canStart: true },
  hasAudit: false,
  hasAnyAudit: false,
};

describe('computeHubActions (issue #219)', () => {
  it('reports an in-flight job as running with its real job ID, for every kind', () => {
    const actions = computeHubActions({
      ...BASE_INPUT,
      activeJobs: [
        makeActiveJob({ jobId: 'job-quick', kind: 'quick-check' }),
        makeActiveJob({ jobId: 'job-audit', kind: 'prospecting-audit' }),
        makeActiveJob({ jobId: 'job-full', kind: 'full-audit' }),
      ],
    });
    expect(actions.runQuickCheck).toEqual({ state: 'running', jobId: 'job-quick' });
    expect(actions.runProspectingAudit).toEqual({ state: 'running', jobId: 'job-audit' });
    expect(actions.runFullAudit).toEqual({ state: 'running', jobId: 'job-full' });
  });

  it('returns the exact same refusal reason the write planner returned, for the scan and full-audit gates', () => {
    const actions = computeHubActions({
      ...BASE_INPUT,
      outreachScanPlan: { refused: 'not-selected' },
      fullAuditPlan: { canStart: false, refusal: 'already-in-flight' },
    });
    expect(actions.runProspectingAudit).toEqual({ state: 'blocked', reason: 'not-selected' });
    expect(actions.runFullAudit).toEqual({ state: 'blocked', reason: 'already-in-flight' });
  });

  it('blocks the quick-check action with the same reasons planQuickCheck would refuse it for', () => {
    expect(
      computeHubActions({
        ...BASE_INPUT,
        quickCheckPlan: { canStart: false, refusal: 'no-own-domain' },
      }).runQuickCheck,
    ).toEqual({ state: 'blocked', reason: 'no-own-domain' });
    expect(
      computeHubActions({
        ...BASE_INPUT,
        quickCheckPlan: { canStart: false, refusal: 'not-qualified' },
      }).runQuickCheck,
    ).toEqual({ state: 'blocked', reason: 'not-qualified' });
    expect(
      computeHubActions({
        ...BASE_INPUT,
        quickCheckPlan: { canStart: false, refusal: 'already-in-flight' },
      }).runQuickCheck,
    ).toEqual({ state: 'blocked', reason: 'already-in-flight' });
  });

  it('never silently turns a blocked action available when an optional sub-read failed (missing plan)', () => {
    const actions = computeHubActions({
      ...BASE_INPUT,
      outreachScanPlan: undefined,
      fullAuditPlan: undefined,
      quickCheckPlan: undefined,
    });
    expect(actions.runProspectingAudit).toEqual({ state: 'blocked', reason: 'unknown' });
    expect(actions.runFullAudit).toEqual({ state: 'blocked', reason: 'unknown' });
    expect(actions.runQuickCheck).toEqual({ state: 'blocked', reason: 'unknown' });
  });

  it('allows the first-email action only once an audit exists and no thread has been created yet', () => {
    expect(computeHubActions({ ...BASE_INPUT, hasAudit: false }).createFirstEmail).toEqual({
      state: 'blocked',
      reason: 'no-audit',
    });
    expect(computeHubActions({ ...BASE_INPUT, hasAudit: true }).createFirstEmail).toEqual({
      state: 'available',
    });
  });

  it('distinguishes a linked general audit from authorized outreach evidence', () => {
    const actions = computeHubActions({ ...BASE_INPUT, hasAnyAudit: true });
    expect(actions.publishPreview).toEqual({
      state: 'blocked',
      reason: 'not-an-outreach-audit',
    });
    expect(actions.createFirstEmail).toEqual({
      state: 'blocked',
      reason: 'not-an-outreach-audit',
    });
  });

  it('marks the first-email action complete once a thread exists, and never offers it again', () => {
    const actions = computeHubActions({
      ...BASE_INPUT,
      hasAudit: true,
      detail: makeDetail({
        thread: {
          threadId: 't-1',
          candidateId: 'cand-1',
          domain: 'hotel-exemple.fr',
          language: 'fr',
          languageSource: 'operator',
          currentTouch: 1,
          state: 'e1-drafted',
          stateEnteredAt: new Date(),
          stateReason: null,
          touches: [],
          lastSyncedAt: null,
          needsReview: null,
          currentOutcome: null,
          drafts: [],
        },
      }),
    });
    expect(actions.createFirstEmail).toEqual({ state: 'complete' });
  });

  it('offers a follow-up only right after touch 1 or touch 2 was sent, matching canGenerateFollowUp', () => {
    const withThreadState = (state: string) =>
      computeHubActions({
        ...BASE_INPUT,
        detail: makeDetail({
          thread: {
            threadId: 't-1',
            candidateId: 'cand-1',
            domain: 'hotel-exemple.fr',
            language: 'fr',
            languageSource: 'operator',
            currentTouch: 1,
            state: state as never,
            stateEnteredAt: new Date(),
            stateReason: null,
            touches: [],
            lastSyncedAt: null,
            needsReview: null,
            currentOutcome: null,
            drafts: [],
          },
        }),
      }).createFollowUp;

    expect(withThreadState('e1-sent')).toEqual({ state: 'available' });
    expect(withThreadState('e2-sent')).toEqual({ state: 'available' });
    expect(withThreadState('e1-drafted')).toEqual({
      state: 'blocked',
      reason: 'wrong-thread-state',
    });
    expect(computeHubActions(BASE_INPUT).createFollowUp).toEqual({
      state: 'blocked',
      reason: 'no-thread',
    });
  });

  it('offers recordOutcome only once a reply landed, and reports complete once one is recorded', () => {
    const withThread = (overrides: {
      state?: string;
      needsReview?: { reason: string; detectedAt: Date } | null;
      currentOutcome?: { outcome: string; lostReason: string | null; recordedAt: Date } | null;
    }) =>
      computeHubActions({
        ...BASE_INPUT,
        detail: makeDetail({
          thread: {
            threadId: 't-1',
            candidateId: 'cand-1',
            domain: 'hotel-exemple.fr',
            language: 'fr',
            languageSource: 'operator',
            currentTouch: 1,
            state: (overrides.state ?? 'e1-sent') as never,
            stateEnteredAt: new Date(),
            stateReason: null,
            touches: [],
            lastSyncedAt: null,
            needsReview: overrides.needsReview ?? null,
            currentOutcome: (overrides.currentOutcome ?? null) as never,
            drafts: [],
          },
        }),
      }).recordOutcome;

    expect(withThread({ state: 'e1-sent' })).toEqual({ state: 'blocked', reason: 'no-reply-yet' });
    expect(withThread({ state: 'replied' })).toEqual({ state: 'available' });
    expect(withThread({ needsReview: { reason: 'bounce', detectedAt: new Date() } })).toEqual({
      state: 'available',
    });
    expect(
      withThread({
        state: 'replied',
        currentOutcome: { outcome: 'won', lostReason: null, recordedAt: new Date() },
      }),
    ).toEqual({ state: 'complete' });
    expect(computeHubActions(BASE_INPUT).recordOutcome).toEqual({
      state: 'blocked',
      reason: 'no-thread',
    });
  });

  it('offers refreshProspect only while some pipeline stage is missing or stale, matching #217 freshness', () => {
    expect(computeHubActions(BASE_INPUT).refreshProspect).toEqual({ state: 'complete' });
    expect(
      computeHubActions({
        ...BASE_INPUT,
        detail: makeDetail({ prescanFreshness: { state: 'missing' } }),
      }).refreshProspect,
    ).toEqual({ state: 'available' });
    expect(
      computeHubActions({
        ...BASE_INPUT,
        detail: makeDetail({
          scoreFreshness: {
            state: 'stale',
            version: 'v1',
            currentVersion: 'v2',
            computedAt: new Date(),
          },
        }),
      }).refreshProspect,
    ).toEqual({ state: 'available' });
  });
});
