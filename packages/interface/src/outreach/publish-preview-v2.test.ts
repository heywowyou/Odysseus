import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditDocumentFields } from '@odysseus/store';
import type { Finding } from '@odysseus/core';
import { createInMemoryPreviewPublisher } from './in-memory-preview-publisher.js';
import { createPreviewToken } from './preview-token.js';
import {
  publishPreviewV2,
  resolvePublishedPreviewForDraft,
  type OutreachPreviewStorePortV2,
  type OutreachPublicationRowV2,
  type RecordPreviewV2Input,
} from './publish-preview-v2.js';

const BASE_URL = 'https://www.odysseusaudit.com';
const NOW = new Date('2026-09-11T09:00:00.000Z');

function audit(overrides: Partial<AuditDocumentFields> = {}): AuditDocumentFields {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://hotel-exemple.fr/',
    startedAt: new Date('2026-09-10T08:00:00.000Z'),
    finishedAt: new Date('2026-09-10T09:30:00.000Z'),
    findingsProvenance: {
      findingsSchemaVersion: 1,
      normalizationFingerprint: 'fp',
      findingsDigest: 'digest',
    },
    tool: {} as AuditDocumentFields['tool'],
    config: {} as AuditDocumentFields['config'],
    crawl: {
      startUrl: 'https://hotel-exemple.fr/',
      visitedCount: 12,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [
      {
        url: 'https://hotel-exemple.fr/',
        status: 'visited',
        errors: {},
        analysisCoverage: {
          passes: {
            rendered: { outcome: 'completed' },
            axe: { outcome: 'completed' },
            extended: { outcome: 'completed' },
            lighthouse: { outcome: 'completed' },
          },
        },
      },
    ] as AuditDocumentFields['pages'],
    outreach: { candidateId: 'candidate-1', cohortId: 'cohort-1', scoringVersion: 'v1' },
    ...overrides,
  } as AuditDocumentFields;
}

function finding(ruleId: string, severity: Finding['severity'], pages: string[]): Finding {
  return {
    findingId: `f-${ruleId}`,
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId,
    category: 'accessibility',
    severity,
    wcagCriteria: [],
    title: 'title',
    description: 'description',
    pageUrls: pages,
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: ruleId,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
  };
}

function row(overrides: Partial<OutreachPublicationRowV2> = {}): OutreachPublicationRowV2 {
  return {
    candidateId: 'candidate-1',
    domain: 'hotel-exemple.fr',
    businessName: 'Hôtel Exemple',
    audit: audit(),
    findings: [
      finding('keyboard-trap', 'critical', ['https://hotel-exemple.fr/']),
      finding('button-name', 'serious', [
        'https://hotel-exemple.fr/',
        'https://hotel-exemple.fr/booking',
      ]),
      finding('label', 'moderate', ['https://hotel-exemple.fr/booking']),
    ],
    ...overrides,
  };
}

interface Harness {
  store: OutreachPreviewStorePortV2 & {
    recorded: RecordPreviewV2Input[];
    refusedSuppressed: boolean;
  };
  publisher: ReturnType<typeof createInMemoryPreviewPublisher>;
}

function harness(
  rowOverrides: Partial<OutreachPublicationRowV2> = {},
  resolution: OutreachPublicationRowV2 | { refused: 'no-audit' } = row(rowOverrides),
): Harness {
  const recorded: RecordPreviewV2Input[] = [];
  const store = {
    recorded,
    refusedSuppressed: false,
    findPublicationRow: () =>
      Promise.resolve('refused' in resolution ? resolution : row(rowOverrides)),
    isSuppressed: () => Promise.resolve(false),
    recordPreview: (input) => {
      recorded.push(input);
      if (store.refusedSuppressed) return Promise.resolve({ recorded: false });
      return Promise.resolve({
        recorded: true,
        previewId: 'preview-1',
        publicExpiresAt: new Date(input.publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      });
    },
    listLivePreviews: () => Promise.resolve([]),
    revokePreview: () => Promise.resolve({ changed: true }),
  } as Harness['store'];
  return { store, publisher: createInMemoryPreviewPublisher() };
}

describe('publishPreviewV2', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes the scorecard, records a full-audit v2 row, and returns the one-time URL', async () => {
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
    expect(result.url).toContain(`${BASE_URL}/apercu/`);
    expect(h.store.recorded).toHaveLength(1);
    const record = h.store.recorded[0]!;
    expect(record).not.toHaveProperty('sourceKind');
    expect(record.auditId).toBe('audit-1');
    // The adapter, not the port, supplies the discriminated source and
    // version; the record helper enforces their pairing.
    expect(record).not.toHaveProperty('previewContentVersion');
    expect(h.publisher.keys()).toHaveLength(1);
  });

  it('refuses with the resolution typed reason and never touches the bucket', async () => {
    const h = harness({}, { refused: 'no-audit' });
    const result = await publishPreviewV2({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result).toEqual({ published: false, refusal: 'no-audit' });
    expect(h.publisher.keys()).toHaveLength(0);
    expect(h.store.recorded).toEqual([]);
  });

  it('refuses an audit whose coverage summary is legacy-shaped', async () => {
    const h = harness({
      audit: audit({
        pages: [
          { url: 'https://hotel-exemple.fr/', status: 'visited', errors: {} },
        ] as AuditDocumentFields['pages'],
      }),
    });
    const result = await publishPreviewV2({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result.published).toBe(false);
    expect(['coverage-incomplete', 'insufficient-safe-cards']).toContain(result.refusal);
  });

  it('refuses fewer than three safe cards without uploading anything', async () => {
    const h = harness({
      findings: [finding('keyboard-trap', 'critical', ['https://hotel-exemple.fr/'])],
    });
    const result = await publishPreviewV2({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result).toEqual({ published: false, refusal: 'insufficient-safe-cards' });
    expect(h.publisher.keys()).toHaveLength(0);
  });

  it('takes the object back down when the record lands after a suppression write', async () => {
    const h = harness();
    h.store.refusedSuppressed = true;
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
    expect(result).toMatchObject({ previewId: 'preview-1' });
    // The categories the email may name are those of the preview's own cards.
    expect(result).toMatchObject({
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
    const harness = draftHarness();
    const result = await resolvePublishedPreviewForDraft({
      ...harness,
      resolveOutreachAudit: () => Promise.resolve({ state: 'refused' }),
    });
    expect(result).toEqual({ refusal: 'preview-wrong-audit' });
  });
});
