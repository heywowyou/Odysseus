import { describe, expect, it } from 'vitest';
import {
  candidateCityLabel,
  diffVersionOptions,
  distinctBookingKinds,
  evidenceAssetRows,
  formatByteSize,
  prescanRows,
  previewState,
  scoreDiffRows,
} from './insights-model';
import type {
  EvidenceResponse,
  PrescanResponse,
  PreviewResponse,
  ScoreDiffResponse,
  ScoreResponse,
} from './insights-model';

const prescan: PrescanResponse = {
  prescanId: 'prescan-1',
  name: 'Hotel Exemple',
  commune: 'GRENOBLE',
  postcode: '38000',
  prescanVersion: 'v3',
  status: 'complete',
  domain: 'hotel-exemple.fr',
  startedAt: '2026-08-29T10:00:00.000Z',
  durationMs: 41_000,
  robotsTxtFound: true,
  absentRoles: [{ role: 'booking', reason: 'no-booking-path' }],
  evidenceStatus: 'complete',
  pages: [
    {
      role: 'homepage',
      httpStatus: 200,
      missingPercent: null,
      rawTextLength: null,
      renderedTextLength: null,
      consoleErrorCount: null,
      axe: null,
      metrics: null,
      bookingEvidenceKinds: ['booking-form', 'external-link'],
      skippedByRobots: false,
      durationMs: 10_000,
    },
    {
      role: 'content',
      httpStatus: 200,
      missingPercent: null,
      rawTextLength: null,
      renderedTextLength: null,
      consoleErrorCount: null,
      axe: null,
      metrics: null,
      bookingEvidenceKinds: ['booking-form'],
      skippedByRobots: false,
      durationMs: 10_000,
    },
  ],
};

const score: ScoreResponse = {
  scoreId: 'score-1',
  candidateId: 'cand-1',
  name: 'Hotel Exemple',
  commune: 'GRENOBLE',
  postcode: '38000',
  scoringVersion: 'hotel-outreach-v1',
  prescanId: 'prescan-1',
  computedAt: '2026-08-29T11:00:00.000Z',
  worthy: true,
  evidenceComplete: true,
  brokenness: {
    total: 12,
    components: [{ id: 'no-alt', points: 6, reason: 'evidence-confirmed' }],
  },
  ability: { total: 3, components: [{ id: 'no-booking', points: 3, reason: 'no-evidence' }] },
};

describe('candidateCityLabel', () => {
  it('joins commune and postcode the same way the prospect detail page does', () => {
    expect(candidateCityLabel({ commune: 'GRENOBLE', postcode: '38000' })).toBe('GRENOBLE 38000');
  });

  it('falls back to whichever half is known', () => {
    expect(candidateCityLabel({ commune: 'GRENOBLE', postcode: null })).toBe('GRENOBLE');
    expect(candidateCityLabel({ commune: null, postcode: '38000' })).toBe('38000');
  });

  it('is undefined when neither is known', () => {
    expect(candidateCityLabel({ commune: null, postcode: null })).toBeUndefined();
  });
});

describe('distinctBookingKinds', () => {
  it('unions the kinds of every page in stable order', () => {
    expect(distinctBookingKinds(prescan)).toEqual(['booking-form', 'external-link']);
  });

  it('is empty for a prescan with no booking evidence', () => {
    expect(distinctBookingKinds({ ...prescan, pages: [] })).toEqual([]);
  });
});

describe('prescanRows', () => {
  it('lists captured pages first, then absent roles with their reason', () => {
    expect(prescanRows(prescan)).toEqual([
      { role: 'homepage', reason: null, page: prescan.pages[0] },
      { role: 'content', reason: null, page: prescan.pages[1] },
      { role: 'booking', reason: 'no-booking-path', page: null },
    ]);
  });

  it('keeps the captured page when a role is both present and marked absent', () => {
    const doubled = {
      ...prescan,
      absentRoles: [{ role: 'homepage' as const, reason: 'no-booking-path' }],
    };
    expect(prescanRows(doubled)).toHaveLength(2);
  });
});

describe('diffVersionOptions', () => {
  it('starts with the current score version', () => {
    expect(diffVersionOptions(score, undefined)).toEqual(['hotel-outreach-v1']);
  });

  it('adds the diff versions without duplicating', () => {
    const diff = {
      candidateId: 'cand-1',
      fromVersion: 'v1',
      toVersion: 'hotel-outreach-v1',
      from: null,
      to: null,
      brokennessDelta: null,
      abilityDelta: null,
    };
    expect(diffVersionOptions(score, diff)).toEqual(['hotel-outreach-v1', 'v1']);
  });
});

describe('scoreDiffRows', () => {
  it('pairs the group totals and keeps a missing side null', () => {
    const diff: ScoreDiffResponse = {
      candidateId: 'cand-1',
      fromVersion: 'v1',
      toVersion: 'v2',
      from: null,
      to: score,
      brokennessDelta: null,
      abilityDelta: null,
    };
    expect(scoreDiffRows(diff)).toEqual([
      { field: 'brokenness', before: null, after: 12, delta: null },
      { field: 'ability', before: null, after: 3, delta: null },
    ]);
  });

  it('carries the store deltas through unchanged', () => {
    const diff: ScoreDiffResponse = {
      candidateId: 'cand-1',
      fromVersion: 'v1',
      toVersion: 'v2',
      from: score,
      to: { ...score, brokenness: { total: 9, components: [] } },
      brokennessDelta: -3,
      abilityDelta: 0,
    };
    expect(scoreDiffRows(diff)).toEqual([
      { field: 'brokenness', before: 12, after: 9, delta: -3 },
      { field: 'ability', before: 3, after: 3, delta: 0 },
    ]);
  });
});

describe('evidenceAssetRows', () => {
  it('returns the two assets in slot order', () => {
    const evidence: EvidenceResponse = {
      prescanId: 'prescan-1',
      name: 'Hotel Exemple',
      commune: 'GRENOBLE',
      postcode: '38000',
      evidenceStatus: 'complete',
      renderComparison: {
        state: 'captured',
        pageRole: 'homepage',
        selectionReason: 'highest-severity',
        byteSize: 204_800,
        width: 1280,
        height: 720,
        altText: { fr: 'Comparaison des deux rendus.', en: 'Render comparison.' },
      },
      specificFailure: { state: 'omitted', reason: 'no-specific-failure' },
      summaries: [],
    };
    expect(evidenceAssetRows(evidence)).toEqual([
      { slot: 'homepage', asset: evidence.renderComparison },
      { slot: 'contact', asset: evidence.specificFailure },
    ]);
  });
});

describe('formatByteSize', () => {
  it('stays in bytes below 1 kB', () => {
    expect(formatByteSize(900)).toBe('900 B');
  });

  it('rounds kilobytes', () => {
    expect(formatByteSize(204_800)).toBe('200 kB');
  });

  it('rounds megabytes', () => {
    expect(formatByteSize(2_500_000)).toBe('2 MB');
  });
});

describe('previewState', () => {
  const preview: PreviewResponse = {
    previewId: 'preview-1',
    name: 'Hotel Exemple',
    commune: 'GRENOBLE',
    postcode: '38000',
    domain: 'hotel-exemple.fr',
    language: 'fr',
    status: 'live',
    publishedAt: '2026-08-29T12:00:00.000Z',
    publicExpiresAt: '2026-09-28T12:00:00.000Z',
    revokedAt: null,
    revokedReason: null,
    prescanVersion: 'v3',
    evidenceVersion: '1',
    previewContentVersion: 'v1',
    sourceKind: 'prescan',
  };
  const now = Date.parse('2026-08-30T12:00:00.000Z');

  it('reads a live unexpired preview as live', () => {
    expect(previewState(preview, now)).toBe('live');
  });

  it('derives expired from a passed public expiry', () => {
    expect(previewState(preview, Date.parse('2026-10-01T12:00:00.000Z'))).toBe('expired');
  });

  it('reads revoked regardless of expiry', () => {
    expect(previewState({ ...preview, status: 'revoked' }, now)).toBe('revoked');
  });

  it('reads an absent preview as none', () => {
    expect(previewState(null, now)).toBe('none');
  });
});
