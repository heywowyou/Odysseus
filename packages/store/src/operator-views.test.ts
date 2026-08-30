import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { HotelCandidate, HotelOutreachScore, HotelPrescanEvidence } from '@odysseus/core';
import { HOTEL_EVIDENCE_OBSERVATIONS } from '@odysseus/core';
import {
  getOperatorProspect,
  getOutcomeSummary,
  getProspectContactView,
  getProspectEvidenceView,
  getProspectOutcomeView,
  getProspectPrescanView,
  getProspectPreviewView,
  getProspectQualificationHistory,
  getProspectScoreDiffView,
  getProspectScoreView,
  getProspectSourceConflicts,
  getProspectThreadView,
  getVendorFingerprintAggregate,
  listOperatorProspects,
  listOutreachReviewDrafts,
  listRepliesNeedingReview,
  type OperatorProspectQueue,
} from './operator-views.js';
import { upsertHotelCandidates } from './hotel-candidates.js';
import {
  recordHotelQualifications,
  type RecordHotelQualificationInput,
} from './hotel-qualifications.js';
import { recordPrescan, type RecordPrescanInput } from './prescans.js';
import { recordHotelScores, type RecordHotelScoreInput } from './scores.js';
import { recordHotelContacts, type RecordHotelContactInput } from './hotel-contacts.js';
import { markOutreachThreadSynced, openOutreachThread } from './outreach-threads.js';
import {
  markOutreachDraftDeleted,
  recordFailedOutreachDraft,
  recordOutreachDraft,
} from './outreach-drafts.js';
import { recordOutreachOutcome } from './outreach-outcomes.js';
import { recordOutreachPreview } from './outreach-previews.js';
import { createHotelCandidateModel } from './schemas/hotel-candidate.schema.js';
import { createHotelQualificationModel } from './schemas/hotel-qualification.schema.js';
import { createPrescanModel } from './schemas/prescan.schema.js';
import { createHotelScoreModel } from './schemas/score.schema.js';
import { createHotelContactModel } from './schemas/hotel-contact.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const RESOLUTION_VERSION = 'rv-operator-views';
const QUALIFICATION_VERSION = 'qv-1';
const PRESCAN_VERSION = 'v3';
const SCORING_VERSION = 'hotel-outreach-v1';
const OPENED_AT = new Date('2026-08-20T09:00:00.000Z');
const SPACING = { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 };
// A 64 character hex value standing in for a captured evidence asset's sha256.
const EVIDENCE_SHA256 = 'a'.repeat(64);
// A 64 character hex value standing in for a preview token's hash.
const PREVIEW_TOKEN_HASH = 'f'.repeat(64);
const SECOND_PREVIEW_TOKEN_HASH = 'e'.repeat(64);

let seq = 0;
function nextLabel(): string {
  seq += 1;
  return String(seq).padStart(3, '0');
}

function candidateInput(overrides: Partial<HotelCandidate> = {}): HotelCandidate {
  const label = nextLabel();
  return {
    candidateId: `cand-${label}`,
    resolutionVersion: RESOLUTION_VERSION,
    identityKey: `domain:hotel-${label}.fr`,
    identityStatus: 'resolved',
    sourceRefs: [
      {
        source: 'atout-france',
        sourceId: `src-${label}`,
        sourceVersion: 'size:mtime',
        ingestRunId: 'run-1',
      },
    ],
    name: `Hôtel ${label}`,
    normalizedName: `hotel ${label}`,
    postcode: '38000',
    commune: 'GRENOBLE',
    starRating: 3,
    campaignEligibility: 'eligible',
    websiteCandidates: [
      {
        raw: `https://www.hotel-${label}.fr`,
        source: 'atout-france',
        sourceId: `src-${label}`,
        kind: 'own-domain',
        hostname: `www.hotel-${label}.fr`,
        registrableDomain: `hotel-${label}.fr`,
      },
    ],
    ownRegistrableDomain: `hotel-${label}.fr`,
    groupStatus: 'independent',
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  };
}

function outreachScore(
  scoringVersion: string,
  brokennessTotal: number,
  abilityTotal: number,
): HotelOutreachScore {
  return {
    scoringVersion,
    brokenness: {
      total: brokennessTotal,
      components: [{ id: 'render-gap', points: brokennessTotal, reason: 'render-gap-severe' }],
    },
    ability: {
      total: abilityTotal,
      components: [{ id: 'capacity', points: abilityTotal, reason: 'capacity-meaningful' }],
    },
    worthy: true,
  };
}

function scoreInput(
  candidateId: string,
  scoringVersion: string,
  brokennessTotal: number,
  abilityTotal: number,
  overrides: Partial<RecordHotelScoreInput> = {},
): RecordHotelScoreInput {
  return {
    candidateId,
    prescanId: `prescan-${candidateId}`,
    domain: `hotel-${candidateId}.fr`,
    resolutionVersion: RESOLUTION_VERSION,
    qualificationVersion: QUALIFICATION_VERSION,
    prescanVersion: PRESCAN_VERSION,
    score: outreachScore(scoringVersion, brokennessTotal, abilityTotal),
    evidenceComplete: true,
    computedAt: new Date('2026-08-22T09:00:00.000Z'),
    ...overrides,
  };
}

function evidenceInput(): HotelPrescanEvidence {
  return {
    schemaVersion: 2,
    status: 'complete',
    renderComparison: { state: 'omitted', reason: 'no-material-render-gap' },
    specificFailure: {
      state: 'captured',
      ref: `evidence/${EVIDENCE_SHA256}.png`,
      sha256: EVIDENCE_SHA256,
      mimeType: 'image/png',
      byteSize: 50_000,
      width: 800,
      height: 600,
      pageRole: 'booking',
      factRef: `fact_0123456789abcdef01234567`,
      altText: { fr: 'Photo de la defaillance', en: 'Photo of the failure' },
      selectionReason: 'booking-keyboard-trap',
    },
    summaries: [
      {
        observation: HOTEL_EVIDENCE_OBSERVATIONS['keyboard-trap']!,
        severity: 'critical',
        wcagCriteria: ['2.1.2'],
        pageRole: 'booking',
      },
      {
        observation: HOTEL_EVIDENCE_OBSERVATIONS['color-contrast']!,
        severity: 'serious',
        wcagCriteria: ['1.4.3'],
        pageRole: 'booking',
      },
      {
        observation: HOTEL_EVIDENCE_OBSERVATIONS['button-name']!,
        severity: 'serious',
        wcagCriteria: ['4.1.2'],
        pageRole: 'booking',
      },
    ],
  };
}

function prescanInput(
  candidateId: string,
  overrides: Partial<RecordPrescanInput> = {},
): RecordPrescanInput {
  const domain = `hotel-${candidateId}.fr`;
  return {
    candidateId,
    resolutionVersion: RESOLUTION_VERSION,
    qualificationVersion: QUALIFICATION_VERSION,
    prescanVersion: PRESCAN_VERSION,
    scanJobId: `job-${candidateId}`,
    domain,
    startUrl: `https://www.${domain}/`,
    status: 'complete',
    pages: [
      {
        role: 'homepage',
        url: `https://www.${domain}/`,
        missingPercent: 55,
        rawTextLength: 5000,
        renderedTextLength: 2200,
        consoleErrorCount: 12,
        axe: {
          violationCount: 3,
          byImpact: { critical: 1, serious: 2, moderate: 0, minor: 0 },
          ruleIds: ['button-name'],
          affectedElementCount: 4,
        },
        metrics: {
          largestContentfulPaintMs: 5200,
          cumulativeLayoutShift: 0.3,
          longTaskCount: 7,
          mainThreadBlockingMs: 900,
          requestCount: 40,
          transferBytes: 1_500_000,
          thirdPartyRequestCount: 5,
          thirdPartyHosts: [`analytics.${domain}`],
          sizeUnavailableCount: 0,
          observationWindowMs: 8000,
          failures: [],
        },
        bookingEvidenceKinds: ['embedded-widget'],
        durationMs: 100,
      },
      {
        role: 'booking',
        url: `https://www.${domain}/reservation`,
        durationMs: 80,
      },
    ],
    absentRoles: [],
    offsiteBookingLinks: [],
    robotsTxtFound: true,
    effectiveDelayMs: 1000,
    artifactsDir: `prescans/${domain}/run`,
    browserVersion: 'test-browser',
    startedAt: new Date('2026-08-21T09:00:00.000Z'),
    durationMs: 2000,
    evidence: evidenceInput(),
    ...overrides,
  };
}

function qualificationInput(
  candidateId: string,
  overrides: Partial<RecordHotelQualificationInput> = {},
): RecordHotelQualificationInput {
  return {
    candidateId,
    resolutionVersion: RESOLUTION_VERSION,
    qualificationVersion: QUALIFICATION_VERSION,
    domain: `hotel-${candidateId}.fr`,
    outcome: 'parked',
    reasons: ['below-three-stars'],
    notes: [],
    siteFacts: {
      reachability: 'ok',
      finalUrl: `https://www.hotel-${candidateId}.fr/`,
      siren: '123456789',
    },
    sireneJoin: {
      status: 'matched',
      effectifBandCode: '21',
      checkedAt: new Date('2026-08-20T10:00:00.000Z'),
    },
    evaluatedAt: new Date('2026-08-20T10:00:00.000Z'),
    ...overrides,
  };
}

function contactInput(
  candidateId: string,
  overrides: Partial<RecordHotelContactInput> = {},
): RecordHotelContactInput {
  return {
    candidateId,
    cohortId: 'cohort-1',
    domain: `hotel-${candidateId}.fr`,
    state: 'found',
    reason: 'role-address-published',
    address: 'direction@hotel-exemple.fr',
    localPart: 'direction',
    source: 'mentions-legales',
    sourceUrl: `https://www.hotel-${candidateId}.fr/mentions-legales`,
    mxStatus: 'has-mx',
    validatedAt: new Date('2026-08-23T09:00:00.000Z'),
    contactVersion: 'cv-1',
    ...overrides,
  };
}

async function seedThread(candidateId: string): Promise<string> {
  const { thread } = await openOutreachThread(connection!, {
    candidateId,
    prescanId: `prescan-${candidateId}`,
    previewId: `preview-${candidateId}`,
    domain: `hotel-${candidateId}.fr`,
    roleAddress: 'direction@hotel-exemple.fr',
    language: 'fr',
    openedAt: OPENED_AT,
    spacing: SPACING,
  });
  return thread.threadId;
}

async function seedDraft(threadId: string, candidateId: string, touch: 1 | 2): Promise<string> {
  const draft = await recordOutreachDraft(connection!, {
    threadId,
    candidateId,
    touch,
    language: 'fr',
    roleAddress: 'direction@hotel-exemple.fr',
    subject: `Objet du message ${candidateId}`,
    body: `Corps du message ${candidateId}`,
    ...(touch === 1
      ? {
          touch1EvidenceSlot: 'summary' as const,
          previewId: `preview-${candidateId}`,
          previewUrl: 'https://previews.exemple.com/p/secret-token',
        }
      : {}),
    prescanVersion: PRESCAN_VERSION,
    evidenceVersion: 'v2',
    outreachPromptVersion: 'p1',
    providerDraftId: `provider-draft-${candidateId}-${touch}`,
    providerMessageId: `provider-message-${candidateId}-${touch}`,
    providerThreadId: `provider-thread-${candidateId}`,
    createdAt: new Date('2026-08-24T09:00:00.000Z'),
  });
  return draft.draftId;
}

/** Seeds the entire funnel for one candidate and returns its ids. The token
 *  hash is a parameter because the previews collection enforces its
 *  uniqueness, so two seeded funnels cannot share one. */
async function seedFullFunnel(
  candidateId: string,
  tokenHash: string = PREVIEW_TOKEN_HASH,
): Promise<{ threadId: string }> {
  await upsertHotelCandidates(connection!, [
    candidateInput({
      candidateId,
      identityKey: `domain:funnel-${candidateId}.fr`,
      name: `Hôtel ${candidateId}`,
      normalizedName: `hotel ${candidateId}`,
      address: '6 rue de la Plage',
      ownRegistrableDomain: `funnel-${candidateId}.fr`,
      websiteCandidates: [
        {
          raw: `https://www.funnel-${candidateId}.fr`,
          source: 'atout-france',
          sourceId: `src-${candidateId}`,
          kind: 'own-domain',
          hostname: `www.funnel-${candidateId}.fr`,
          registrableDomain: `funnel-${candidateId}.fr`,
        },
      ],
      review: { state: 'pending', queuedReason: 'own-domain-disagreement' },
    }),
  ]);
  await recordHotelQualifications(connection!, [
    qualificationInput(candidateId, {
      outcome: 'qualified',
      reasons: [],
    }),
  ]);
  const prescan = await recordPrescan(connection!, prescanInput(candidateId));
  await recordHotelScores(connection!, [scoreInput(candidateId, SCORING_VERSION, 42, 65)]);
  await recordHotelContacts(connection!, [contactInput(candidateId)]);
  const threadId = await seedThread(candidateId);
  await seedDraft(threadId, candidateId, 1);
  await recordOutreachPreview(connection!, {
    tokenHash,
    objectKey: `previews/${tokenHash}/document.html`,
    candidateId,
    prescanId: prescan.prescanId,
    domain: `funnel-${candidateId}.fr`,
    language: 'fr',
    prescanVersion: PRESCAN_VERSION,
    evidenceVersion: 'v2',
    previewContentVersion: 'pv-1',
    publishedAt: new Date('2026-08-25T09:00:00.000Z'),
  });
  await recordOutreachOutcome(connection!, {
    threadId,
    outcome: 'reply-positive',
    actor: 'operator',
    recordedAt: new Date('2026-08-26T09:00:00.000Z'),
  });
  return { threadId };
}

// The field names below are the ones the safety rule forbids in any operator
// view. The values are the seeded stand-ins for the real material.
const FORBIDDEN_KEYS = [
  'roleAddress',
  'address',
  'localPart',
  'sourceUrl',
  'subject',
  'body',
  'subjectHash',
  'bodyHash',
  'tokenHash',
  'objectKey',
  'previewUrl',
  'siteFacts',
  'sha256',
  'ref',
  'factRef',
];
const FORBIDDEN_VALUES = [
  'direction@hotel-exemple.fr',
  '6 rue de la Plage',
  'previews.exemple.com',
  PREVIEW_TOKEN_HASH,
  SECOND_PREVIEW_TOKEN_HASH,
  EVIDENCE_SHA256,
];

function collectKeys(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      collectKeys(child, found);
    }
  }
}

function expectSafeShape(shape: unknown): void {
  const keys = new Set<string>();
  collectKeys(shape, keys);
  for (const forbidden of FORBIDDEN_KEYS) {
    expect(keys.has(forbidden), `forbidden key "${forbidden}" in view`).toBe(false);
  }
  const text = JSON.stringify(shape) ?? '';
  for (const forbidden of FORBIDDEN_VALUES) {
    expect(text).not.toContain(forbidden);
  }
}

describe.skipIf(!mongoAvailable)('operator views', () => {
  beforeEach(async () => {
    if (!connection) return;
    await createHotelCandidateModel(connection).deleteMany({});
    await createHotelQualificationModel(connection).deleteMany({});
    await createPrescanModel(connection).deleteMany({});
    await createHotelScoreModel(connection).deleteMany({});
    await createHotelContactModel(connection).deleteMany({});
    await createOutreachThreadModel(connection).deleteMany({});
    await createOutreachDraftModel(connection).deleteMany({});
    await createOutreachOutcomeModel(connection).deleteMany({});
    await createOutreachPreviewModel(connection).deleteMany({});
  });

  describe('listOperatorProspects', () => {
    it('paginates deterministically and covers every row exactly once across offset windows', async () => {
      if (!connection) return;
      const inputs = Array.from({ length: 25 }, () => candidateInput());
      await upsertHotelCandidates(connection!, inputs);

      const collected: string[] = [];
      for (const offset of [0, 10, 20, 30]) {
        const page = await listOperatorProspects(connection!, {
          resolutionVersion: RESOLUTION_VERSION,
          limit: 10,
          offset,
        });
        expect(page.limit).toBe(10);
        expect(page.offset).toBe(offset);
        expect(page.total).toBe(25);
        collected.push(...page.rows.map((row) => row.candidateId));
        expect(page.rows.length).toBe(offset < 25 ? Math.min(10, 25 - offset) : 0);
      }
      expect(collected).toHaveLength(25);
      expect(new Set(collected).size).toBe(25);
      // Sorted set: walking again collects the same ids in the same order.
      const secondWalk: string[] = [];
      for (const offset of [0, 10, 20]) {
        const page = await listOperatorProspects(connection!, {
          resolutionVersion: RESOLUTION_VERSION,
          limit: 10,
          offset,
        });
        secondWalk.push(...page.rows.map((row) => row.candidateId));
      }
      expect(secondWalk).toEqual(collected.slice(0, 30));
    });

    it('returns identical order for the same query and applies the default and hard cap', async () => {
      if (!connection) return;
      const inputs = Array.from({ length: 5 }, () => candidateInput());
      await upsertHotelCandidates(connection!, inputs);

      const first = await listOperatorProspects(connection!, {
        resolutionVersion: RESOLUTION_VERSION,
      });
      const second = await listOperatorProspects(connection!, {
        resolutionVersion: RESOLUTION_VERSION,
      });
      expect(first.rows.map((row) => row.candidateId)).toEqual(
        second.rows.map((row) => row.candidateId),
      );
      // Default limit is 50; the hard cap clamps a larger request.
      expect(first.limit).toBe(50);

      const capped = await listOperatorProspects(connection!, {
        resolutionVersion: RESOLUTION_VERSION,
        limit: 500,
      });
      expect(capped.limit).toBe(200);
    });

    it('keeps same-named candidates stable through the unique id tiebreaker', async () => {
      if (!connection) return;
      const shared = 'Hôtel du Leman';
      const inputs = Array.from({ length: 3 }, () =>
        candidateInput({ name: shared, normalizedName: 'hotel du leman' }),
      );
      await upsertHotelCandidates(connection!, inputs);

      const page = await listOperatorProspects(connection!, {
        resolutionVersion: RESOLUTION_VERSION,
      });
      expect(page.rows.map((row) => row.name)).toEqual([shared, shared, shared]);
      const ids = page.rows.map((row) => row.candidateId);
      expect(new Set(ids).size).toBe(3);
      expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : 1)));
    });

    it('filters every operator queue', async () => {
      if (!connection) return;
      const join = candidateInput({
        identityStatus: 'needs-review',
        review: { state: 'pending', queuedReason: 'siret-disagreement' },
      });
      const parked = candidateInput();
      const rejected = candidateInput();
      const engaged = candidateInput();
      const grouped = candidateInput({
        groupStatus: 'group-member',
        groupDomain: 'groupe-exemple.fr',
        groupSize: 12,
      });
      const plain = candidateInput();
      await upsertHotelCandidates(connection!, [join, parked, rejected, engaged, grouped, plain]);

      await recordHotelQualifications(connection!, [
        qualificationInput(parked.candidateId, { outcome: 'parked' }),
        qualificationInput(rejected.candidateId, {
          outcome: 'rejected',
          reasons: ['dns-unresolved'],
        }),
        qualificationInput(engaged.candidateId, {
          outcome: 'already-engaged',
          reasons: ['accessibility-statement-published'],
        }),
      ]);

      const members = async (queue: OperatorProspectQueue) => {
        const page = await listOperatorProspects(connection!, {
          resolutionVersion: RESOLUTION_VERSION,
          queue,
        });
        return page.rows.map((row) => row.candidateId).sort();
      };

      await expect(members('join-review')).resolves.toEqual([join.candidateId]);
      await expect(members('parked')).resolves.toEqual([parked.candidateId]);
      await expect(members('rejected')).resolves.toEqual([rejected.candidateId]);
      await expect(members('already-engaged')).resolves.toEqual([engaged.candidateId]);
      await expect(members('groups')).resolves.toEqual([grouped.candidateId]);

      // Plain field filters refine the same query surface.
      const pendingReview = await listOperatorProspects(connection!, {
        resolutionVersion: RESOLUTION_VERSION,
        reviewState: 'pending',
      });
      expect(pendingReview.rows.map((row) => row.candidateId)).toEqual([join.candidateId]);

      const notEvaluated = await listOperatorProspects(connection!, {
        resolutionVersion: RESOLUTION_VERSION,
        qualificationOutcome: 'not-evaluated',
      });
      expect(notEvaluated.rows.map((row) => row.candidateId).sort()).toEqual(
        [join.candidateId, grouped.candidateId, plain.candidateId].sort(),
      );
    });

    it('carries qualification reason codes, score totals, contact, thread, and outcome per row', async () => {
      if (!connection) return;
      const candidateId = 'cand-funnel-row';
      await seedFullFunnel(candidateId);
      const parkedId = 'cand-parked-row';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId: parkedId })]);
      await recordHotelQualifications(connection!, [qualificationInput(parkedId)]);

      const page = await listOperatorProspects(connection!, {
        resolutionVersion: RESOLUTION_VERSION,
        limit: 10,
        offset: 0,
      });
      const funnelRow = page.rows.find((row) => row.candidateId === candidateId);
      expect(funnelRow).toBeDefined();
      expect(funnelRow?.qualificationOutcome).toBe('qualified');
      expect(funnelRow?.qualificationReasons).toEqual([]);
      expect(funnelRow?.prescanStatus).toBe('complete');
      expect(funnelRow?.scoringVersion).toBe(SCORING_VERSION);
      expect(funnelRow?.brokennessTotal).toBe(42);
      expect(funnelRow?.abilityTotal).toBe(65);
      expect(funnelRow?.contactState).toBe('found');
      expect(funnelRow?.threadState).toBe('open');
      expect(funnelRow?.outcome).toBe('reply-positive');
      expectSafeShape(funnelRow);

      const parkedRow = page.rows.find((row) => row.candidateId === parkedId);
      expect(parkedRow?.qualificationOutcome).toBe('parked');
      expect(parkedRow?.qualificationReasons).toEqual(['below-three-stars']);
      expect(parkedRow?.scoringVersion).toBeNull();
      expect(parkedRow?.contactState).toBeNull();
    });
  });

  describe('projection safety', () => {
    it('exposes no message body, address, or hash material in any view', async () => {
      if (!connection) return;
      const candidateId = 'cand-safety';
      const { threadId } = await seedFullFunnel(candidateId);
      await markOutreachThreadSynced(connection!, threadId, new Date(), {
        reason: 'ambiguous-disappearance',
        detectedAt: new Date('2026-08-27T09:00:00.000Z'),
      });
      // A second candidate so the cross-candidate lists have breadth. Its
      // preview needs its own token hash: the collection enforces uniqueness.
      const otherId = 'cand-safety-2';
      await seedFullFunnel(otherId, SECOND_PREVIEW_TOKEN_HASH);

      const views: unknown[] = [
        await getOperatorProspect(connection!, candidateId),
        await listOperatorProspects(connection!, {
          resolutionVersion: RESOLUTION_VERSION,
          limit: 50,
          offset: 0,
        }),
        await getProspectSourceConflicts(connection!, candidateId),
        await getProspectQualificationHistory(connection!, candidateId, { limit: 10, offset: 0 }),
        await getProspectPrescanView(connection!, candidateId),
        await getProspectEvidenceView(connection!, candidateId),
        await getProspectScoreView(connection!, candidateId),
        await getProspectContactView(connection!, candidateId),
        await getProspectPreviewView(connection!, candidateId),
        await getProspectThreadView(connection!, candidateId),
        await getProspectOutcomeView(connection!, candidateId, { limit: 10, offset: 0 }),
        await listOutreachReviewDrafts(connection!, { limit: 50, offset: 0 }),
        await listRepliesNeedingReview(connection!, { limit: 50, offset: 0 }),
        await getOutcomeSummary(connection!),
        await getVendorFingerprintAggregate(connection!, PRESCAN_VERSION),
      ];
      for (const view of views) expectSafeShape(view);

      // The composed detail still shows the states, only stripped of material.
      const detail = await getOperatorProspect(connection!, candidateId);
      expect(detail?.contact?.state).toBe('found');
      expect(detail?.thread?.drafts).toHaveLength(1);
      expect(detail?.evidence?.evidenceStatus).toBe('complete');
      const reviewList = await listRepliesNeedingReview(connection!, { limit: 50, offset: 0 });
      expect(reviewList.total).toBeGreaterThanOrEqual(1);
      expect(reviewList.rows[0]?.reviewReason).toBe('ambiguous-disappearance');
    });
  });

  describe('composed detail', () => {
    it('returns coherent joined data for one seeded candidate', async () => {
      if (!connection) return;
      const candidateId = 'cand-detail';
      await seedFullFunnel(candidateId);

      const detail = await getOperatorProspect(connection!, candidateId);
      expect(detail).not.toBeNull();
      expect(detail?.name).toBe('Hôtel cand-detail');
      expect(detail?.reviewState).toBe('pending');
      expect(detail?.qualificationOutcome).toBe('qualified');
      expect(detail?.qualification?.outcome).toBe('qualified');
      expect(detail?.qualification?.sireneStatus).toBe('matched');
      expect(detail?.prescanStatus).toBe('complete');
      expect(detail?.prescan?.pages).toHaveLength(2);
      expect(detail?.prescan?.pages[0]?.metrics?.largestContentfulPaintMs).toBe(5200);
      expect(detail?.prescan?.pages[0]?.axe?.violationCount).toBe(3);
      expect(detail?.evidence?.specificFailure.state).toBe('captured');
      expect(detail?.evidence?.summaries).toHaveLength(3);
      expect(detail?.score?.brokenness.total).toBe(42);
      expect(detail?.score?.ability.total).toBe(65);
      expect(detail?.score?.brokenness.components[0]?.reason).toBe('render-gap-severe');
      expect(detail?.contact?.state).toBe('found');
      expect(detail?.contact?.mxStatus).toBe('has-mx');
      expect(detail?.thread?.state).toBe('open');
      expect(detail?.thread?.currentOutcome?.outcome).toBe('reply-positive');
      expect(detail?.thread?.drafts[0]?.status).toBe('created');
      expect(detail?.preview?.status).toBe('live');
      expect(detail?.outcomes.rows[0]?.outcome).toBe('reply-positive');
      expect(detail?.conflicts).toEqual([]);
      expect(detail?.sourceRefs).toHaveLength(1);
    });

    it('returns null for an unknown candidate', async () => {
      if (!connection) return;
      await expect(getOperatorProspect(connection!, 'cand-missing')).resolves.toBeNull();
    });
  });

  describe('score views', () => {
    it('returns the latest score with complete breakdown and version', async () => {
      if (!connection) return;
      const candidateId = 'cand-score';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId })]);
      await recordHotelScores(connection!, [
        scoreInput(candidateId, SCORING_VERSION, 10, 20, {
          computedAt: new Date('2026-08-22T08:00:00.000Z'),
        }),
        scoreInput(candidateId, SCORING_VERSION, 30, 40, {
          computedAt: new Date('2026-08-22T09:00:00.000Z'),
        }),
      ]);

      const view = await getProspectScoreView(connection!, candidateId);
      expect(view?.scoringVersion).toBe(SCORING_VERSION);
      // Insert-only collection: latest computation wins, the earlier one
      // remains a document beside it.
      expect(view?.brokenness.total).toBe(30);
      expect(view?.brokenness.components[0]?.id).toBe('render-gap');
    });

    it('diffs two scoring versions for one candidate', async () => {
      if (!connection) return;
      const candidateId = 'cand-diff';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId })]);
      await recordHotelScores(connection!, [
        scoreInput(candidateId, 'v-a', 30, 60),
        scoreInput(candidateId, 'v-b', 45, 55),
      ]);

      const diff = await getProspectScoreDiffView(connection!, candidateId, 'v-a', 'v-b');
      expect(diff.from?.brokenness.total).toBe(30);
      expect(diff.to?.brokenness.total).toBe(45);
      expect(diff.brokennessDelta).toBe(15);
      expect(diff.abilityDelta).toBe(-5);
    });

    it('reports null deltas when one version has no score', async () => {
      if (!connection) return;
      const candidateId = 'cand-diff-missing';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId })]);
      await recordHotelScores(connection!, [scoreInput(candidateId, 'v-a', 30, 60)]);

      const diff = await getProspectScoreDiffView(connection!, candidateId, 'v-a', 'v-b');
      expect(diff.to).toBeNull();
      expect(diff.brokennessDelta).toBeNull();
    });
  });

  describe('qualification history', () => {
    it('paginates generations newest first with reasons and without raw site facts', async () => {
      if (!connection) return;
      const candidateId = 'cand-history';
      await upsertHotelCandidates(connection!, [candidateInput({ candidateId })]);
      await recordHotelQualifications(connection!, [
        qualificationInput(candidateId, {
          qualificationVersion: 'qv-1',
          outcome: 'rejected',
          reasons: ['dns-unresolved'],
          evaluatedAt: new Date('2026-08-01T10:00:00.000Z'),
        }),
        qualificationInput(candidateId, {
          qualificationVersion: 'qv-2',
          outcome: 'qualified',
          reasons: [],
          evaluatedAt: new Date('2026-08-05T10:00:00.000Z'),
        }),
      ]);

      const firstPage = await getProspectQualificationHistory(connection!, candidateId, {
        limit: 1,
        offset: 0,
      });
      expect(firstPage.total).toBe(2);
      expect(firstPage.rows[0]?.qualificationVersion).toBe('qv-2');
      expect(firstPage.rows[0]?.outcome).toBe('qualified');

      const secondPage = await getProspectQualificationHistory(connection!, candidateId, {
        limit: 1,
        offset: 1,
      });
      expect(secondPage.rows[0]?.qualificationVersion).toBe('qv-1');
      expect(secondPage.rows[0]?.reasons).toEqual(['dns-unresolved']);
      expect(secondPage.rows[0]?.sireneStatus).toBe('matched');

      expectSafeShape(firstPage);
    });
  });

  describe('review lists', () => {
    it('lists only pending drafts across candidates, metadata only', async () => {
      if (!connection) return;
      const a = 'cand-drafts-a';
      const b = 'cand-drafts-b';
      const threadA = await seedThread(a);
      const threadB = await seedThread(b);
      const liveA = await seedDraft(threadA, a, 1);
      const deleted = await seedDraft(threadA, a, 2);
      await markOutreachDraftDeleted(connection!, deleted);
      await recordFailedOutreachDraft(connection!, {
        threadId: threadA,
        candidateId: a,
        touch: 3,
        language: 'fr',
        roleAddress: 'direction@hotel-exemple.fr',
        prescanVersion: PRESCAN_VERSION,
        evidenceVersion: 'v2',
        outreachPromptVersion: 'p1',
        failureReason: 'suppressed-before-draft',
        createdAt: new Date('2026-08-24T10:00:00.000Z'),
      });
      const liveB = await seedDraft(threadB, b, 1);

      const page = await listOutreachReviewDrafts(connection!, { limit: 10, offset: 0 });
      expect(page.total).toBe(2);
      expect(page.rows.map((row) => row.draftId).sort()).toEqual([liveA, liveB].sort());
      expect(page.rows.every((row) => row.hasProviderDraft)).toBe(true);
      expectSafeShape(page);
    });

    it('lists only threads whose replies need review', async () => {
      if (!connection) return;
      const flagged = 'cand-reply-flagged';
      const clean = 'cand-reply-clean';
      const threadFlagged = await seedThread(flagged);
      await seedThread(clean);
      await markOutreachThreadSynced(connection!, threadFlagged, new Date(), {
        reason: 'ambiguous-disappearance',
        detectedAt: new Date('2026-08-27T09:00:00.000Z'),
      });

      const page = await listRepliesNeedingReview(connection!, { limit: 10, offset: 0 });
      expect(page.total).toBe(1);
      expect(page.rows[0]?.candidateId).toBe(flagged);
      expect(page.rows[0]?.reviewReason).toBe('ambiguous-disappearance');
      expectSafeShape(page);
    });
  });

  describe('aggregates', () => {
    it('composes the vendor fingerprint aggregate', async () => {
      if (!connection) return;
      const a = 'cand-vendor-a';
      const b = 'cand-vendor-b';
      await upsertHotelCandidates(connection!, [
        candidateInput({ candidateId: a }),
        candidateInput({ candidateId: b }),
      ]);
      await recordPrescan(
        connection!,
        prescanInput(a, {
          offsiteBookingLinks: ['https://secure.booking-exemple.com/cart'],
        }),
      );
      await recordPrescan(
        connection!,
        prescanInput(b, {
          offsiteBookingLinks: ['https://secure.booking-exemple.com/cart'],
        }),
      );

      const aggregate = await getVendorFingerprintAggregate(connection!, PRESCAN_VERSION, 2);
      expect(aggregate.prescanVersion).toBe(PRESCAN_VERSION);
      expect(aggregate.prescansRead).toBe(2);
      expect(aggregate.bookingHosts[0]?.value).toBe('secure.booking-exemple.com');
      expect(aggregate.bookingHosts[0]?.hotels).toBe(2);
    });

    it('summarizes outcomes as vocabulary counts only', async () => {
      if (!connection) return;
      const positive = 'cand-outcome-pos';
      const lost = 'cand-outcome-lost';
      const threadPositive = await seedThread(positive);
      const threadLost = await seedThread(lost);
      await recordOutreachOutcome(connection!, {
        threadId: threadPositive,
        outcome: 'reply-positive',
        actor: 'operator',
        recordedAt: new Date('2026-08-26T09:00:00.000Z'),
      });
      await recordOutreachOutcome(connection!, {
        threadId: threadLost,
        outcome: 'lost',
        lostReason: 'budget',
        actor: 'operator',
        recordedAt: new Date('2026-08-26T10:00:00.000Z'),
      });

      const summary = await getOutcomeSummary(connection!);
      expect(summary.total).toBe(2);
      expect(summary.byOutcome['reply-positive']).toBe(1);
      expect(summary.byOutcome['lost']).toBe(1);
      expect(summary.byLostReason['budget']).toBe(1);
      expectSafeShape(summary);
    });
  });
});
