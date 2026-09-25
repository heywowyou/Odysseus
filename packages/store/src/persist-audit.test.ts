import { afterAll, describe, expect, it } from 'vitest';
import {
  FINDINGS_DELTA_COVERAGE_VERSION,
  FINDINGS_SCHEMA_VERSION,
  type AuditManifest,
  type FindingsDeltaCoverage,
  type Finding,
} from '@odysseus/core';
import { getAudit } from './audits.js';
import { findAuditEvidenceCoverage } from './findings-delta-baseline.js';
import { persistAudit } from './persist-audit.js';
import { getStoredPrimarySeverityRollups } from './severity-rollup.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

function buildManifest(overrides: Partial<AuditManifest> = {}): AuditManifest {
  return {
    auditId: 'persist-test',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30000,
      lighthouseTimeoutMs: 60000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
    ...overrides,
  };
}

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: 'f001',
    auditId: 'persist-test',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    title: 'Color contrast',
    description: 'Insufficient color contrast',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'aaaaaaaaaaaaaaaa',
    firstSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    lastSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('persistAudit', () => {
  it('upserts the audit document and its findings, denormalizing siteUrl', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-1' });
    const finding = buildFinding({ auditId: 'persist-test-1', dedupeKey: 'p1p1p1p1p1p1p1p1' });

    await persistAudit(connection!, manifest, [finding]);

    const AuditModel = createAuditModel(connection!);
    const FindingModel = createFindingModel(connection!);

    const storedAudit = await AuditModel.findOne({ auditId: 'persist-test-1' });
    expect(storedAudit).not.toBeNull();
    expect(storedAudit?.siteUrl).toBe(manifest.siteUrl);
    expect(storedAudit?.startedAt).toBeInstanceOf(Date);

    const storedFindings = await FindingModel.find({ auditId: 'persist-test-1' });
    expect(storedFindings).toHaveLength(1);
    expect(storedFindings[0]?.siteUrl).toBe(manifest.siteUrl);
    expect(storedFindings[0]?.dedupeKey).toBe('p1p1p1p1p1p1p1p1');
  });

  it('stores the evidence coverage signature a re-audit delta will compare', async () => {
    const manifest = buildManifest({ auditId: 'persist-coverage' });
    const coverage: FindingsDeltaCoverage = {
      version: FINDINGS_DELTA_COVERAGE_VERSION,
      scopeSignature: 'sha256:scope',
      inventorySignature: 'sha256:inventory',
      capabilityRegistryVersion: 'cap-v1',
      checks: [
        {
          checkId: 'axe',
          version: '1',
          surfaces: ['baseline-desktop'],
          frameCapability: 'document-only',
          semanticallyConditional: false,
        },
      ],
      surfaces: ['baseline-desktop'],
      observations: { p1p1p1p1p1p1p1p1: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
    };

    await persistAudit(connection!, manifest, [], coverage);

    expect(await findAuditEvidenceCoverage(connection!, 'persist-coverage')).toEqual(coverage);
    /* A re-persist without a graph - the retried-stage case - removes any
     * signature instead of leaving one the surviving evidence cannot show. */
    await persistAudit(connection!, manifest, []);
    expect(await findAuditEvidenceCoverage(connection!, 'persist-coverage')).toBeUndefined();
    expect(await findAuditEvidenceCoverage(connection!, 'persist-test-1')).toBeUndefined();
  });

  it('stores the primary severity rollup keyed to the findings digest (issue #508)', async () => {
    const manifest = buildManifest({
      auditId: 'persist-rollup',
      findingsProvenance: {
        findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
        normalizationFingerprint: 'fp',
        findingsDigest: 'digest-a',
      },
    });
    const rollup = { critical: 1, serious: 0, moderate: 2, minor: 0 };

    await persistAudit(connection!, manifest, [], undefined, rollup);
    expect(
      (await getStoredPrimarySeverityRollups(connection!, ['persist-rollup'])).get(
        'persist-rollup',
      ),
    ).toEqual(rollup);

    // A persist that brings no rollup leaves none behind for the new findings.
    await persistAudit(connection!, manifest, []);
    expect((await getStoredPrimarySeverityRollups(connection!, ['persist-rollup'])).size).toBe(0);
  });

  it('is idempotent: persisting the same auditId twice does not duplicate documents', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-2' });
    const finding = buildFinding({ auditId: 'persist-test-2', dedupeKey: 'p2p2p2p2p2p2p2p2' });

    await persistAudit(connection!, manifest, [finding]);
    await persistAudit(connection!, manifest, [finding]);

    const AuditModel = createAuditModel(connection!);
    const FindingModel = createFindingModel(connection!);

    expect(await AuditModel.countDocuments({ auditId: 'persist-test-2' })).toBe(1);
    expect(await FindingModel.countDocuments({ auditId: 'persist-test-2' })).toBe(1);
  });

  it('persists sitemap mode, coverage, and page discovery provenance', async () => {
    const manifest = buildManifest({
      auditId: 'persist-sitemap-coverage',
      config: { ...buildManifest().config, sitemapMode: 'supplement' },
      crawl: {
        ...buildManifest().crawl,
        sitemapCoverage: {
          declaredPageCount: 2,
          eligiblePageCount: 2,
          scannedPageCount: 2,
          filteredPageCount: 0,
          capOmittedPageCount: 0,
          failedSitemapCount: 0,
        },
      },
      pages: [
        {
          url: 'https://example.com/orphan',
          depth: 0,
          status: 'visited',
          discoveryMethod: 'sitemap-only',
          errors: {},
        },
        {
          url: 'https://example.com/en',
          depth: 1,
          status: 'discovered-not-scanned',
          discoveryMethod: 'link',
          discoveredFrom: 'https://example.com/',
          errors: {},
        },
      ],
    });

    await persistAudit(connection!, manifest, []);

    const stored = await createAuditModel(connection!)
      .findOne({ auditId: manifest.auditId })
      .lean();
    expect(stored?.config.sitemapMode).toBe('supplement');
    expect(stored?.crawl.sitemapCoverage?.scannedPageCount).toBe(2);
    expect(stored?.pages[0]?.discoveryMethod).toBe('sitemap-only');
    expect(stored?.pages[1]?.status).toBe('discovered-not-scanned');
    expect(stored?.pages[1]?.discoveredFrom).toBe('https://example.com/');
  });

  it('round-trips versioned page coverage and bounded continuation omissions', async () => {
    const manifest = buildManifest({
      auditId: 'persist-analysis-coverage',
      pages: [
        {
          url: 'https://example.com/',
          depth: 0,
          status: 'visited',
          analysisCoverage: {
            plannerVersion: 'v1',
            role: 'content',
            confidence: 'high',
            templateFamilyId: 'family-a',
            reasonCodes: ['content-json-ld', 'stable-family-representative'],
            passes: {
              rendered: { outcome: 'completed' },
              axe: { outcome: 'completed' },
              extended: {
                outcome: 'partial',
                failedCheckIds: ['form-error-handling', 'reflow'],
              },
              lighthouse: { outcome: 'failed', failedCheckIds: ['lighthouse'] },
            },
          },
          errors: { lighthouse: 'timed out' },
        },
        {
          url: 'https://example.com/article',
          depth: 1,
          status: 'visited',
          analysisCoverage: {
            plannerVersion: 'v1',
            role: 'content',
            confidence: 'high',
            templateFamilyId: 'family-a',
            reasonCodes: ['content-json-ld'],
            passes: {
              rendered: { outcome: 'completed' },
              axe: { outcome: 'failed', failedCheckIds: ['axe'] },
              extended: { outcome: 'completed' },
              lighthouse: { outcome: 'not-planned' },
            },
          },
          errors: { axe: 'frame detached' },
        },
      ],
      continuationGuardSummary: {
        guardVersion: 'v1',
        familyMaxEnqueued: 60,
        families: [
          {
            familyKey: 'path:/page/{n}/',
            basis: 'numbered-pagination-control',
            enqueuedCount: 60,
            omittedCount: 3,
            omittedExampleUrls: ['https://example.com/page/61/'],
          },
        ],
        additionalFamiliesOmittedCount: 2,
        totalOmittedUrlCount: 9,
      },
    });

    await persistAudit(connection!, manifest, []);

    const stored = await createAuditModel(connection!)
      .findOne({ auditId: manifest.auditId })
      .lean();
    expect(stored?.pages[0]?.analysisCoverage).toEqual(manifest.pages[0]?.analysisCoverage);
    expect(stored?.pages[1]?.analysisCoverage?.passes.lighthouse.outcome).toBe('not-planned');
    expect(stored?.continuationGuardSummary).toEqual(manifest.continuationGuardSummary);
  });

  // Issue #173: these four fields were absent from audit.schema.ts, so
  // Mongoose strict mode stripped them from persistAudit's $set upsert and
  // the operator never saw them back through getAudit.
  it('round-trips site signals, CrUX field data, translation clusters, and the benchmark percentile', async () => {
    const manifest = buildManifest({
      auditId: 'persist-manifest-extras',
      siteSignals: {
        hasTransactionalFlow: true,
        transactionalFlowEvidence: [
          {
            kind: 'booking-engine-domain-reference',
            selector: 'script#booking-config',
            pageUrl: 'https://example.com/',
            detail: 'Inline booking config references the delegated engine domain.',
            providerUrl: 'https://booking.example-engine.com/',
          },
        ],
        transactionalFlowRedirectChecks: [
          {
            pageUrl: 'https://example.com/',
            linkUrl: 'https://booking.example-engine.com/property',
            destinationUrl: 'https://booking.example-engine.com/property?id=1',
            resolution: 'single-property',
            detail: 'Redirect followed to a single-property booking engine.',
          },
        ],
        transactionalFlowAmbiguities: [
          {
            selector: 'a.item__booking-link',
            pageUrl: 'https://example.com/chambres',
            href: 'javascript:void(0)',
            matchedVia: ['text', 'class'],
            detail: 'Booking-intent anchor whose destination could not be established.',
          },
        ],
        siren: '552100554',
        mentionsLegalesPageUrl: 'https://example.com/mentions-legales',
        siteName: 'Example',
      },
      cruxFieldData: {
        available: true,
        lcp: { p75: 2340.5 },
        cls: { p75: 0.08 },
        inp: { p75: 180 },
      },
      translationClusters: [
        {
          canonicalPageUrl: 'https://example.com/',
          members: [
            { pageUrl: 'https://example.com/', lang: 'fr' },
            { pageUrl: 'https://example.com/en', lang: 'en' },
            { pageUrl: 'https://example.com/pt-pt' },
          ],
        },
      ],
      benchmarkPercentile: {
        kind: 'scored',
        siteId: 'example.com',
        score: 12,
        percentile: 40,
        cohortSize: 20,
        scanDateRange: { earliest: '2026-08-01', latest: '2026-08-31' },
      },
    });

    await persistAudit(connection!, manifest, []);

    const stored = await getAudit(connection!, manifest.auditId);
    expect(stored).not.toBeNull();
    expect(stored?.siteSignals).toEqual(manifest.siteSignals);
    expect(stored?.siteSignals?.hasTransactionalFlow).toBe(true);
    expect(stored?.cruxFieldData).toEqual(manifest.cruxFieldData);
    expect(stored?.translationClusters).toEqual(manifest.translationClusters);
    expect(stored?.benchmarkPercentile).toEqual(manifest.benchmarkPercentile);
  });

  it('removes findings that are absent when the same audit is persisted again', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-retry' });
    const retained = buildFinding({
      auditId: 'persist-test-retry',
      dedupeKey: 'retry-retained01',
    });
    const obsolete = buildFinding({
      auditId: 'persist-test-retry',
      findingId: 'f002',
      dedupeKey: 'retry-obsolete01',
    });

    await persistAudit(connection!, manifest, [retained, obsolete]);
    await persistAudit(connection!, manifest, [retained]);

    const FindingModel = createFindingModel(connection!);
    const storedFindings = await FindingModel.find({ auditId: 'persist-test-retry' }).lean();
    expect(storedFindings.map((finding) => finding.dedupeKey)).toEqual(['retry-retained01']);
  });

  it('creates the required indexes', async () => {
    const AuditModel = createAuditModel(connection!);
    const FindingModel = createFindingModel(connection!);
    await AuditModel.ensureIndexes();
    await FindingModel.ensureIndexes();

    const auditIndexKeys = (await AuditModel.collection.indexes()).map((idx) => idx.key);
    const findingIndexKeys = (await FindingModel.collection.indexes()).map((idx) => idx.key);

    expect(auditIndexKeys).toContainEqual({ siteUrl: 1, startedAt: -1 });
    expect(findingIndexKeys).toContainEqual({ auditId: 1 });
    expect(findingIndexKeys).toContainEqual({ siteUrl: 1, dedupeKey: 1 });
    expect(findingIndexKeys).toContainEqual({ auditId: 1, severity: 1 });
  });

  it('removes every stored finding when a retry has zero findings', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-3' });
    const finding = buildFinding({
      auditId: 'persist-test-3',
      dedupeKey: 'zero-retry-key01',
    });

    await persistAudit(connection!, manifest, [finding]);
    await persistAudit(connection!, manifest, []);

    const FindingModel = createFindingModel(connection!);
    expect(await FindingModel.countDocuments({ auditId: 'persist-test-3' })).toBe(0);
  });
});
