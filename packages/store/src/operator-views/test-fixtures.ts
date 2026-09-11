/**
 * Shared fixture builders for the operator view family tests. Not named
 * *.test.ts/*.spec.ts, so Vitest's glob does not pick this up as a suite
 * (same trick as ../test-support.ts).
 *
 * The seed helpers take the suite's mongoose connection explicitly because
 * each family test file probes MongoDB itself and owns that connection.
 */

import { expect } from 'vitest';
import type { HotelCandidate, HotelOutreachScore, HotelPrescanEvidence } from '@odysseus/core';
import { HOTEL_EVIDENCE_OBSERVATIONS } from '@odysseus/core';
import type { Connection } from 'mongoose';
import { upsertHotelCandidates } from '../hotel-candidates.js';
import {
  recordHotelQualifications,
  type RecordHotelQualificationInput,
} from '../hotel-qualifications.js';
import { recordPrescan, type RecordPrescanInput } from '../prescans.js';
import { recordHotelScores, type RecordHotelScoreInput } from '../scores.js';
import { recordHotelContacts, type RecordHotelContactInput } from '../hotel-contacts.js';
import { openOutreachThread } from '../outreach-threads.js';
import { recordOutreachDraft } from '../outreach-drafts.js';
import { recordOutreachOutcome } from '../outreach-outcomes.js';
import { recordOutreachPreview } from '../outreach-previews.js';

export const RESOLUTION_VERSION = 'rv-operator-views';
const QUALIFICATION_VERSION = 'qv-1';
export const PRESCAN_VERSION = 'v3';
export const SCORING_VERSION = 'hotel-outreach-v1';
const OPENED_AT = new Date('2026-08-20T09:00:00.000Z');
const SPACING = { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 };
// A 64 character hex value standing in for a captured evidence asset's sha256.
const EVIDENCE_SHA256 = 'a'.repeat(64);
// A 64 character hex value standing in for a preview token's hash.
const PREVIEW_TOKEN_HASH = 'f'.repeat(64);
export const SECOND_PREVIEW_TOKEN_HASH = 'e'.repeat(64);

let seq = 0;
function nextLabel(): string {
  seq += 1;
  return String(seq).padStart(3, '0');
}

export function candidateInput(overrides: Partial<HotelCandidate> = {}): HotelCandidate {
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

export function scoreInput(
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

export function prescanInput(
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

export function qualificationInput(
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

export async function seedThread(connection: Connection, candidateId: string): Promise<string> {
  const { thread } = await openOutreachThread(connection, {
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

export async function seedDraft(
  connection: Connection,
  threadId: string,
  candidateId: string,
  touch: 1 | 2,
): Promise<string> {
  const draft = await recordOutreachDraft(connection, {
    threadId,
    candidateId,
    touch,
    language: 'fr',
    roleAddress: 'direction@hotel-exemple.fr',
    subject: `Objet du message ${candidateId}`,
    body: `Corps du message ${candidateId}`,
    htmlBody: '<div>Corps confidentiel.</div>',
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
export async function seedFullFunnel(
  connection: Connection,
  candidateId: string,
  tokenHash: string = PREVIEW_TOKEN_HASH,
): Promise<{ threadId: string }> {
  await upsertHotelCandidates(connection, [
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
  await recordHotelQualifications(connection, [
    qualificationInput(candidateId, {
      outcome: 'qualified',
      reasons: [],
    }),
  ]);
  const prescan = await recordPrescan(connection, prescanInput(candidateId));
  await recordHotelScores(connection, [scoreInput(candidateId, SCORING_VERSION, 42, 65)]);
  await recordHotelContacts(connection, [contactInput(candidateId)]);
  const threadId = await seedThread(connection, candidateId);
  await seedDraft(connection, threadId, candidateId, 1);
  await recordOutreachPreview(connection, {
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
  await recordOutreachOutcome(connection, {
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
  'htmlBody',
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

export function expectSafeShape(shape: unknown): void {
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
