/**
 * Tests for the v2 full-scan outreach preview publication path.
 */

import { describe, expect, it } from 'vitest';
import type { AuditDocumentFields } from '@odysseus/store';
import type { Finding } from '@odysseus/core';
import { createInMemoryPreviewPublisher } from './in-memory-preview-publisher.js';
import { createPreviewToken } from './preview-token.js';
import {
  buildOutreachPreviewSummaryV2,
  publishPreviewV2,
  resolvePublishedPreviewForDraft,
  type OutreachPreviewStorePortV2,
  type OutreachPublicationRowV2,
} from './publish-preview-v2.js';

const NOW = new Date('2026-09-11T09:00:00.000Z');
const BASE_URL = 'https://www.odysseusaudit.com';

function finding(
  ruleId: string,
  pageUrls: string[],
  severity: Finding['severity'] = 'critical',
): Finding {
  return {
    findingId: `f-${ruleId}`,
    ruleId,
    category: 'accessibility',
    severity,
    title: ruleId,
    description: ruleId,
    help: ruleId,
    pageUrls,
    evidence: [],
  } as unknown as Finding;
}

function audit(): AuditDocumentFields {
  return {
    auditId: 'audit-1',
    domain: 'hotel-exemple.fr',
    startedAt: new Date('2026-09-11T07:00:00.000Z'),
    finishedAt: new Date('2026-09-11T08:00:00.000Z'),
    coverage: {
      kind: 'current',
      inventoriedUrlCount: 3,
      eligibleHtmlUrlCount: 3,
      content: { completed: 3, partial: 0, failed: 0 },
      passes: {
        lighthouse: { completed: 2, partial: 0, failed: 0, notSelected: 1 },
        axe: { completed: 3, partial: 0, failed: 0, notSelected: 0 },
        extendedAccessibility: { completed: 3, partial: 0, failed: 0, notSelected: 0 },
        renderDiff: { completed: 3, partial: 0, failed: 0, notSelected: 0 },
      },
      pages: [],
    },
  } as unknown as AuditDocumentFields;
}

function row(): OutreachPublicationRowV2 {
  return {
    candidateId: 'candidate-1',
    domain: 'hotel-exemple.fr',
    businessName: 'Hôtel Exemple',
    audit: audit(),
    findings: [
      finding('color-contrast', ['https://hotel-exemple.fr/', 'https://hotel-exemple.fr/chambres']),
      finding('button-name', ['https://hotel-exemple.fr/'], 'serious'),
      finding('link-name', ['https://hotel-exemple.fr/chambres'], 'moderate'),
    ],
  };
}

function harness(overrides: { suppressed?: boolean; recordPreview?: boolean } = {}) {
  const publisher = createInMemoryPreviewPublisher();
  const recorded: unknown[] = [];
  const previews: { previewId: string; objectKey: string }[] = [];
  const store: OutreachPreviewStorePortV2 & { recorded: unknown[] } = {
    recorded,
    findPublicationRow: () => Promise.resolve(row()),
    isSuppressed: () => Promise.resolve(overrides.suppressed ?? false),
    recordPreview: (input) => {
      recorded.push(input);
      if (overrides.recordPreview === false) return Promise.resolve({ recorded: false as const });
      previews.push({ previewId: 'preview-1', objectKey: input.objectKey });
      return Promise.resolve({
        recorded: true as const,
        previewId: 'preview-1',
        publicExpiresAt: new Date('2026-10-11T09:00:00.000Z'),
      });
    },
    listLivePreviews: () => Promise.resolve(previews),
    revokePreview: () => Promise.resolve({ changed: true }),
  };
  return { store, publisher };
}

describe('buildOutreachPreviewSummaryV2', () => {
  it('builds the scorecard from the full outreach audit', () => {
    const result = buildOutreachPreviewSummaryV2({
      row: row(),
      language: 'fr',
      publicBaseUrl: BASE_URL,
    });
    expect('summary' in result).toBe(true);
    if (!('summary' in result)) return;
    expect(result.summary.distinctFindingCount).toBe(3);
    expect(result.summary.affectedPageCount).toBe(2);
    expect(result.summary.proofCards).toHaveLength(3);
  });
});

describe('publishPreviewV2', () => {
  it('publishes one validated v2 scorecard and records its audit id', async () => {
    const h = harness();
    const result = await publishPreviewV2({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result.published).toBe(true);
    expect(result.previewId).toBe('preview-1');
    expect(result.url).toContain(`${BASE_URL}/apercu/`);
    expect(h.publisher.keys()).toHaveLength(1);
    expect(h.store.recorded[0]).toMatchObject({ auditId: 'audit-1', candidateId: 'candidate-1' });
  });

  it('refuses a suppressed domain before publication', async () => {
    const h = harness({ suppressed: true });
    const result = await publishPreviewV2({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result).toEqual({ published: false, refusal: 'suppressed' });
    expect(h.publisher.keys()).toHaveLength(0);
  });

  it('removes the uploaded object if the record loses the suppression race', async () => {
    const h = harness({ recordPreview: false });
    const result = await publishPreviewV2({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result).toEqual({ published: false, refusal: 'suppressed' });
    expect(h.publisher.keys()).toHaveLength(0);
  });

  it('plans without observing anything under a dry run', async () => {
    const h = harness();
    const result = await publishPreviewV2({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: true,
      now: NOW,
    });
    expect(result.plan).toEqual({
      wouldPublish: true,
      domain: 'hotel-exemple.fr',
      language: 'fr',
      distinctFindings: 3,
      affectedPages: 2,
      proofCards: 3,
    });
    expect(h.store.recorded).toEqual([]);
    expect(h.publisher.keys()).toHaveLength(0);
  });
});

describe('resolvePublishedPreviewForDraft', () => {
  const TOKEN = createPreviewToken();
  const baseRecord = {
    previewId: 'preview-1',
    status: 'live',
    sourceKind: 'full-audit',
    previewContentVersion: 'v2',
    candidateId: 'candidate-1',
    auditId: 'audit-1',
    publicExpiresAt: new Date('2026-10-11T09:00:00.000Z'),
  };

  function draftHarness(
    overrides: {
      record?: Partial<typeof baseRecord> | null;
      auditAuditId?: string;
      candidateId?: string;
      previewToken?: string;
    } = {},
  ) {
    return {
      findByTokenHash: () =>
        Promise.resolve(overrides.record === null ? null : { ...baseRecord, ...overrides.record }),
      resolveOutreachAudit: () =>
        Promise.resolve({
          state: 'resolved' as const,
          audit: { auditId: overrides.auditAuditId ?? 'audit-1' },
        }),
      findingsForAudit: () => Promise.resolve(row().findings),
      candidateId: overrides.candidateId ?? 'candidate-1',
      previewToken: overrides.previewToken ?? TOKEN,
      publicBaseUrl: BASE_URL,
      now: NOW,
    };
  }

  it('resolves a live v2 preview of the current candidate audit', async () => {
    const result = await resolvePublishedPreviewForDraft(draftHarness());
    expect(result).toMatchObject({
      previewId: 'preview-1',
      distinctFindingCount: 3,
      affectedPageCount: 2,
      severityTotals: { critical: 1, serious: 1, moderate: 1, minor: 0 },
      proofCardCategories: ['accessibility', 'accessibility', 'accessibility'],
    });
    expect((result as { url: string }).url).toContain(`${BASE_URL}/apercu/${TOKEN}`);
  });

  it('refuses an unknown token', async () => {
    const result = await resolvePublishedPreviewForDraft(draftHarness({ record: null }));
    expect(result).toEqual({ refusal: 'preview-not-published' });
  });

  const refusalCases: [string, Partial<typeof baseRecord>][] = [
    ['a revoked row', { status: 'revoked' }],
    ['an expired row', { publicExpiresAt: new Date('2026-09-01T09:00:00.000Z') }],
    ['a v1 prescan row', { sourceKind: 'prescan' }],
    ['a different audit', { auditId: 'audit-2' }],
    ['a different candidate', { candidateId: 'candidate-2' }],
  ];
  it.each(refusalCases)('refuses %s', async (_name, overrides) => {
    const result = await resolvePublishedPreviewForDraft(draftHarness({ record: overrides }));
    expect(result).toEqual({
      refusal:
        overrides['status'] === 'revoked'
          ? 'preview-revoked'
          : overrides['publicExpiresAt'] !== undefined
            ? 'preview-expired'
            : overrides['sourceKind'] === 'prescan'
              ? 'preview-not-published'
              : 'preview-wrong-audit',
    });
  });

  it('refuses when the audit no longer yields any proof card', async () => {
    const result = await resolvePublishedPreviewForDraft({
      ...draftHarness(),
      findingsForAudit: () => Promise.resolve([]),
    });
    expect(result).toEqual({ refusal: 'preview-wrong-audit' });
  });

  it('refuses when the resolution refuses the candidate outright', async () => {
    const h = draftHarness();
    const result = await resolvePublishedPreviewForDraft({
      ...h,
      resolveOutreachAudit: () => Promise.resolve({ state: 'refused' }),
    });
    expect(result).toEqual({ refusal: 'preview-wrong-audit' });
  });
});
