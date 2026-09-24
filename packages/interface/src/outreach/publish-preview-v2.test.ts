/**
 * Plan 069: v3 publication follows the selected French report structure while
 * retaining deterministic public copy and v2 live-link compatibility.
 */

import { describe, expect, it, vi } from 'vitest';
import type { AnalysisDocument, AuditDocumentFields } from '@odysseus/store';
import type { Finding } from '@odysseus/core';
import { OUTREACH_PROOF_CARD_COPY } from '@odysseus/report';
import { createInMemoryPreviewPublisher } from './in-memory-preview-publisher.js';
import { createPreviewToken } from './preview-token.js';
import {
  buildOutreachPreviewSummaryV3,
  publishPreviewV3,
  resolvePublishedPreviewForDraft,
  type OutreachPreviewStorePortV3,
  type OutreachPublicationRowV3,
  type PublishedPreviewFacts,
} from './publish-preview-v2.js';

const NOW = new Date('2026-09-19T09:00:00.000Z');
const BASE_URL = 'https://www.odysseusaudit.com';
const PROVENANCE = {
  findingsSchemaVersion: 1 as const,
  normalizationFingerprint: 'fp-v3',
  findingsDigest: 'sha256:' + 'a'.repeat(64),
};

function finding(
  findingId: string,
  ruleId: string,
  pageUrls: string[],
  severity: Finding['severity'] = 'serious',
): Finding {
  return {
    findingId,
    ruleId,
    category: 'accessibility',
    severity,
    title: `raw title ${ruleId}`,
    description: `raw description ${ruleId}`,
    help: `raw help ${ruleId}`,
    pageUrls,
    elements: [],
    evidence: [],
  } as unknown as Finding;
}

const FINDINGS = [
  finding('f-1', 'button-name', ['https://hotel-exemple.fr/'], 'critical'),
  finding('f-2', 'link-name', ['https://hotel-exemple.fr/chambres'], 'serious'),
  finding('f-3', 'image-alt', ['https://hotel-exemple.fr/contact'], 'moderate'),
];

function audit(): AuditDocumentFields {
  return {
    auditId: 'audit-1',
    domain: 'hotel-exemple.fr',
    siteUrl: 'https://hotel-exemple.fr/',
    startedAt: new Date('2026-09-19T07:00:00.000Z'),
    finishedAt: new Date('2026-09-19T08:00:00.000Z'),
    findingsProvenance: PROVENANCE,
    pages: [
      'https://hotel-exemple.fr/',
      'https://hotel-exemple.fr/chambres',
      'https://hotel-exemple.fr/contact',
    ].map((url) => ({
      url,
      depth: 0,
      status: 'visited',
      analysisCoverage: {
        plannerVersion: 'v1',
        role: 'content',
        confidence: 'high',
        reasonCodes: ['content-json-ld'],
        passes: {
          rendered: { outcome: 'completed' },
          axe: { outcome: 'completed' },
          extended: { outcome: 'completed' },
          lighthouse: { outcome: 'completed' },
        },
      },
      errors: {},
    })),
    crawl: { visitedCount: 3 },
  } as unknown as AuditDocumentFields;
}

function analysis(): AnalysisDocument {
  return {
    analysisId: 'analysis-fr-1',
    auditId: 'audit-1',
    findingsProvenance: PROVENANCE,
    language: 'fr',
    model: 'gpt-5.6-luna',
    temperature: 0,
    generatedAt: NOW,
    executiveSummary: 'MODEL EXECUTIVE SENTINEL',
    overallRisk: 'high',
    quickWins: [],
    notes: 'MODEL NOTES SENTINEL',
    themes: [
      {
        title: 'MODEL SECOND SENTINEL',
        category: 'accessibility',
        businessImpact: 'MODEL IMPACT SECOND SENTINEL',
        effort: 'low',
        impact: 'high',
        priorityRank: 2,
        findingIds: ['f-1'],
        recommendedActions: ['MODEL ACTION SECOND SENTINEL'],
      },
      {
        title: 'MODEL FIRST SENTINEL',
        category: 'accessibility',
        businessImpact: 'MODEL IMPACT FIRST SENTINEL',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
        findingIds: ['f-2'],
        recommendedActions: ['MODEL ACTION FIRST SENTINEL'],
      },
      {
        title: 'MODEL THIRD SENTINEL',
        category: 'accessibility',
        businessImpact: 'MODEL IMPACT THIRD SENTINEL',
        effort: 'medium',
        impact: 'medium',
        priorityRank: 3,
        findingIds: ['f-3'],
        recommendedActions: ['MODEL ACTION THIRD SENTINEL'],
      },
    ],
  } as unknown as AnalysisDocument;
}

function row(overrides: Partial<OutreachPublicationRowV3> = {}): OutreachPublicationRowV3 {
  return {
    prospectId: 'prospect-1',
    domain: 'hotel-exemple.fr',
    businessName: 'Hôtel Exemple',
    dataOrigins: ['public-hotel-catalogue', 'public-website'],
    audit: audit(),
    findings: FINDINGS,
    analysis: analysis(),
    diagnostics: { status: 'complete', clientLimitations: [], operationalWarnings: [] },
    ...overrides,
  };
}

function limitationWith(fr: string) {
  return {
    limitationId: 'lim-wording',
    code: 'mobile-ua-negotiated-variant-untested',
    summary: { fr, en: 'The mobile analysis keeps our published crawler identity.' },
    reportDestination: 'section-11',
    evidenceRefs: ['ref-1'],
  };
}

function harness(
  overrides: {
    suppressed?: boolean;
    recordPreview?: boolean;
    previous?: { previewId: string; objectKey: string };
    failPreviousDelete?: boolean;
    row?: OutreachPublicationRowV3;
  } = {},
) {
  const publisher = createInMemoryPreviewPublisher();
  const recorded: unknown[] = [];
  const previews: { previewId: string; objectKey: string }[] = [];
  const revoked: string[] = [];
  const operations: string[] = [];
  const store: OutreachPreviewStorePortV3 & { recorded: unknown[] } = {
    recorded,
    findPublicationRow: () => Promise.resolve(overrides.row ?? row()),
    isSuppressed: () => Promise.resolve(overrides.suppressed ?? false),
    recordPreview: (input) => {
      recorded.push(input);
      if (overrides.recordPreview === false) return Promise.resolve({ recorded: false as const });
      previews.push({ previewId: 'preview-1', objectKey: input.objectKey });
      return Promise.resolve({
        recorded: true as const,
        previewId: 'preview-1',
        publicExpiresAt: new Date('2026-10-19T09:00:00.000Z'),
      });
    },
    listLivePreviews: () =>
      Promise.resolve([...(overrides.previous ? [overrides.previous] : []), ...previews]),
    revokePreview: (previewId) => {
      operations.push(`revoke:${previewId}`);
      revoked.push(previewId);
      return Promise.resolve({ changed: true });
    },
  };
  const deleteObject = publisher.delete.bind(publisher);
  publisher.delete = async (objectKey) => {
    operations.push(`delete:${objectKey}`);
    if (overrides.failPreviousDelete && objectKey === overrides.previous?.objectKey) {
      throw new Error('bucket unavailable');
    }
    await deleteObject(objectKey);
  };
  return { store, publisher, revoked, operations };
}

describe('buildOutreachPreviewSummaryV3', () => {
  it('uses the paid report priority order but only reviewed public copy', () => {
    const result = buildOutreachPreviewSummaryV3({
      row: row(),
      language: 'fr',
      publicBaseUrl: BASE_URL,
    });
    expect('summary' in result).toBe(true);
    if (!('summary' in result)) return;

    expect(result.summary.priorityCards.map((card) => card.title.fr)).toEqual([
      OUTREACH_PROOF_CARD_COPY['link-name']?.fr,
      OUTREACH_PROOF_CARD_COPY['button-name']?.fr,
      OUTREACH_PROOF_CARD_COPY['image-alt']?.fr,
    ]);
    const publicBytes = JSON.stringify(result.summary);
    for (const sentinel of [
      'MODEL EXECUTIVE SENTINEL',
      'MODEL FIRST SENTINEL',
      'MODEL IMPACT FIRST SENTINEL',
      'MODEL ACTION FIRST SENTINEL',
      'MODEL NOTES SENTINEL',
    ]) {
      expect(publicBytes).not.toContain(sentinel);
    }
  });

  it('carries client limitations and drops operational warnings', () => {
    const limitation = {
      limitationId: 'lim-1',
      code: 'temporal-drift',
      summary: {
        fr: 'Le site a changé pendant le scan.',
        en: 'The site changed during the scan.',
      },
      reportDestination: 'section-11',
      evidenceRefs: ['ref-1'],
    };
    const result = buildOutreachPreviewSummaryV3({
      row: row({
        diagnostics: {
          status: 'limited',
          clientLimitations: [limitation],
          operationalWarnings: [{ code: 'environment-unapproved', referenceCount: 2 }],
        },
      }),
      language: 'fr',
      publicBaseUrl: BASE_URL,
    });
    expect('summary' in result).toBe(true);
    if (!('summary' in result)) return;
    expect(result.summary.dataQuality).toEqual({
      status: 'limited',
      limitations: [{ code: 'temporal-drift', summary: limitation.summary }],
    });
    expect(JSON.stringify(result.summary)).not.toContain('environment-unapproved');
  });

  it('publishes diagnostics-unavailable rather than refusing it', () => {
    const result = buildOutreachPreviewSummaryV3({
      row: row({
        diagnostics: { status: 'unavailable', clientLimitations: [], operationalWarnings: [] },
      }),
      language: 'fr',
      publicBaseUrl: BASE_URL,
    });
    expect('summary' in result && result.summary.dataQuality).toEqual({
      status: 'unavailable',
      limitations: [],
    });
  });

  it('fails closed when a top-three report priority has no reviewed public copy', () => {
    const badAnalysis = analysis();
    const badFinding = finding('f-x', 'private-unreviewed-rule', ['https://hotel-exemple.fr/']);
    badAnalysis.themes[0] = {
      ...badAnalysis.themes[0]!,
      priorityRank: 1,
      findingIds: ['f-x'],
    };
    badAnalysis.themes[1] = { ...badAnalysis.themes[1]!, priorityRank: 2 };
    const result = buildOutreachPreviewSummaryV3({
      row: row({ analysis: badAnalysis, findings: [badFinding, ...FINDINGS] }),
      language: 'fr',
      publicBaseUrl: BASE_URL,
    });
    expect(result).toEqual({ refused: 'priority-copy-unavailable' });
  });
});

describe('publishPreviewV3', () => {
  it('publishes v3 and persists exact semantic lineage plus Touch-1 facts', async () => {
    const h = harness();
    const result = await publishPreviewV3({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      prospectId: 'prospect-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result.published).toBe(true);
    expect(h.publisher.keys()).toHaveLength(1);
    expect(h.store.recorded[0]).toMatchObject({
      auditId: 'audit-1',
      sourceAnalysisId: 'analysis-fr-1',
      sourceFindingsDigest: PROVENANCE.findingsDigest,
      publishedFacts: {
        distinctFindingCount: 3,
        affectedPageCount: 3,
        priorityCardCategories: ['accessibility', 'accessibility', 'accessibility'],
      },
    });
  });

  it('deletes the old public object before revoking its record', async () => {
    const previous = { previewId: 'preview-old', objectKey: 'old-preview.html' };
    const h = harness({ previous });
    await h.publisher.put({
      objectKey: previous.objectKey,
      html: '<p>old</p>',
      publicExpiresAt: new Date('2026-10-19T09:00:00.000Z'),
    });

    const result = await publishPreviewV3({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      prospectId: 'prospect-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result.published).toBe(true);
    expect(h.operations.indexOf(`delete:${previous.objectKey}`)).toBeLessThan(
      h.operations.indexOf(`revoke:${previous.previewId}`),
    );
    expect(h.publisher.keys()).not.toContain(previous.objectKey);
    expect(h.revoked).toContain(previous.previewId);
  });

  it('keeps a previous link live and cleans up the replacement when old-object deletion fails', async () => {
    const previous = { previewId: 'preview-old', objectKey: 'old-preview.html' };
    const h = harness({ previous, failPreviousDelete: true });
    await h.publisher.put({
      objectKey: previous.objectKey,
      html: '<p>old</p>',
      publicExpiresAt: new Date('2026-10-19T09:00:00.000Z'),
    });

    const result = await publishPreviewV3({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      prospectId: 'prospect-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result).toEqual({ published: false, refusal: 'superseded-preview-cleanup-failed' });
    expect(h.publisher.keys()).toEqual([previous.objectKey]);
    expect(h.revoked).toEqual(['preview-1']);
    expect(h.operations).not.toContain(`revoke:${previous.previewId}`);
  });

  it('validates the exact v3 story even in dry-run mode', async () => {
    const h = harness();
    const result = await publishPreviewV3({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      prospectId: 'prospect-1',
      language: 'fr',
      dryRun: true,
      now: NOW,
    });
    expect(result.plan).toEqual({
      wouldPublish: true,
      domain: 'hotel-exemple.fr',
      language: 'fr',
      distinctFindings: 3,
      affectedPages: 3,
      priorityCards: 3,
    });
    expect(h.store.recorded).toEqual([]);
    expect(h.publisher.keys()).toHaveLength(0);
  });

  it('publishes an audit whose stored limitation uses the legacy crawler wording', async () => {
    const h = harness({
      row: row({
        diagnostics: {
          status: 'limited',
          clientLimitations: [
            limitationWith(
              "L'analyse mobile conserve l'identité de notre robot d'analyse : seules la fenêtre d'affichage et les capacités tactiles changent.",
            ),
          ],
          operationalWarnings: [],
        },
      }),
    });
    const result = await publishPreviewV3({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      prospectId: 'prospect-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result.published).toBe(true);
    const [key] = h.publisher.keys();
    const html = (await h.publisher.get(key!))?.html ?? '';
    expect(html).toContain('notre outil d');
    expect(html).not.toContain('notre robot');
  });

  it('refuses without uploading when the final lint rejects the page', async () => {
    const h = harness({
      row: row({
        diagnostics: {
          status: 'limited',
          clientLimitations: [limitationWith('Nos outils déterministes ont vu ce point.')],
          operationalWarnings: [],
        },
      }),
    });
    for (const dryRun of [true, false]) {
      const result = await publishPreviewV3({
        store: h.store,
        publisher: h.publisher,
        publicBaseUrl: BASE_URL,
        prospectId: 'prospect-1',
        language: 'fr',
        dryRun,
        now: NOW,
      });
      expect(result).toEqual({ published: false, refusal: 'preview-lint-rejected' });
    }
    expect(h.publisher.keys()).toHaveLength(0);
    expect(h.store.recorded).toEqual([]);
  });

  it('still removes an uploaded object if persistence loses the suppression race', async () => {
    const h = harness({ recordPreview: false });
    const result = await publishPreviewV3({
      store: h.store,
      publisher: h.publisher,
      publicBaseUrl: BASE_URL,
      prospectId: 'prospect-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });
    expect(result).toEqual({ published: false, refusal: 'suppressed' });
    expect(h.publisher.keys()).toHaveLength(0);
  });
});

describe('resolvePublishedPreviewForDraft', () => {
  const TOKEN = createPreviewToken();
  const facts: PublishedPreviewFacts = {
    distinctFindingCount: 99,
    affectedPageCount: 7,
    severityTotals: { critical: 2, serious: 3, moderate: 4, minor: 90 },
    priorityCardCategories: ['seo', 'accessibility', 'performance'],
  };
  const v3Record = {
    previewId: 'preview-1',
    status: 'live',
    sourceKind: 'full-audit',
    previewContentVersion: 'v3',
    prospectId: 'prospect-1',
    auditId: 'audit-1',
    sourceAnalysisId: 'analysis-fr-1',
    sourceFindingsDigest: PROVENANCE.findingsDigest,
    publishedFacts: facts,
    publicExpiresAt: new Date('2026-10-19T09:00:00.000Z'),
  };

  function v3Harness(
    record: typeof v3Record = v3Record,
    source: { analysisId?: string; digest?: string } = {
      analysisId: 'analysis-fr-1',
      digest: PROVENANCE.findingsDigest,
    },
  ) {
    return {
      findByTokenHash: () => Promise.resolve(record),
      resolveOutreachAudit: () =>
        Promise.resolve({
          state: 'resolved' as const,
          audit: {
            auditId: 'audit-1',
            ...(source.digest === undefined ? {} : { findingsDigest: source.digest }),
            ...(source.analysisId === undefined ? {} : { selectedFrAnalysisId: source.analysisId }),
          },
        }),
      findingsForAudit: vi.fn(() => Promise.resolve(FINDINGS)),
      prospectId: 'prospect-1',
      previewToken: TOKEN,
      publicBaseUrl: BASE_URL,
      now: NOW,
    };
  }

  it('uses the exact stored v3 facts without recomputing findings', async () => {
    const h = v3Harness();
    const result = await resolvePublishedPreviewForDraft(h);
    expect(result).toMatchObject({
      distinctFindingCount: 99,
      affectedPageCount: 7,
      severityTotals: facts.severityTotals,
      proofCardCategories: ['seo', 'accessibility', 'performance'],
    });
    expect(h.findingsForAudit).not.toHaveBeenCalled();
  });

  it('marks a v3 publication stale when the selected French analysis changes', async () => {
    const result = await resolvePublishedPreviewForDraft(
      v3Harness(v3Record, { analysisId: 'analysis-fr-2', digest: PROVENANCE.findingsDigest }),
    );
    expect(result).toEqual({ refusal: 'preview-stale' });
  });

  it('marks a v3 publication stale when findings provenance changes', async () => {
    const result = await resolvePublishedPreviewForDraft(
      v3Harness(v3Record, { analysisId: 'analysis-fr-1', digest: 'sha256:' + 'b'.repeat(64) }),
    );
    expect(result).toEqual({ refusal: 'preview-stale' });
  });

  it('keeps a live v2 publication compatible', async () => {
    const result = await resolvePublishedPreviewForDraft({
      ...v3Harness(),
      findByTokenHash: () =>
        Promise.resolve({
          previewId: 'preview-v2',
          status: 'live',
          sourceKind: 'full-audit',
          previewContentVersion: 'v2',
          prospectId: 'prospect-1',
          auditId: 'audit-1',
          publicExpiresAt: new Date('2026-10-19T09:00:00.000Z'),
        }),
    });
    expect(result).toMatchObject({
      previewId: 'preview-v2',
      distinctFindingCount: 3,
      affectedPageCount: 3,
    });
  });
});
