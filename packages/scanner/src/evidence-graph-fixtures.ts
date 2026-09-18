/**
 * A synthetic two-page full audit whose evidence graph approves cleanly, for
 * tests that mutate one input at a time. Identifier-only: no live host and no
 * client material, and no stand-in for the real-audit corpus.
 */
import {
  buildAuditScopeSnapshot,
  FINDINGS_SCHEMA_VERSION,
  NORMALIZATION_FINGERPRINT,
  type AuditScopeSnapshot,
  type AuditScopeSnapshotInput,
  type Finding,
} from '@odysseus/core';
import {
  buildAuditEnvironmentFingerprint,
  type AuditEnvironmentFingerprintInput,
} from './audit-environment-fingerprint.js';
import type { AcquisitionAttemptRecord } from './check-attempt-ledger.js';
import {
  PAGE_CHECK_IDS,
  REQUIRED_SITE_CHECK_IDS,
  SITE_REQUEST_SURFACE_ID,
} from './evidence-acquisition.js';
import type { AuditEvidenceGraphInput, EvidencePageObservation } from './evidence-graph.js';
import { InventoryLedger, type InventoryDisposition } from './inventory-ledger.js';
import { PUBLIC_SITE_NETWORK_POLICY } from './network-target-policy.js';
import type { FrameObservation } from './page-readiness.js';
import { buildRobotsPolicySnapshot } from './robots-policy-snapshot.js';

export const ORIGIN = 'https://hotel-exemple.fr';
export const HOME = `${ORIGIN}/`;
export const ROOMS = `${ORIGIN}/chambres`;
const AUDIT_ID = 'audit-graph-test';
const AT = new Date('2026-09-18T09:00:00.000Z');
const SURFACE = 'surface:baseline-desktop';

/** The frozen scope, with optional input overrides for cases that need an
 *  operator-set bound, a seed or an exclusion. Overrides are full input
 *  fields: spread `scope().bounds` to widen one bound. */
export function scope(overrides: Partial<AuditScopeSnapshotInput> = {}): AuditScopeSnapshot {
  return buildAuditScopeSnapshot({
    evidenceEpoch: 1,
    startUrl: HOME,
    hostAliases: ['hotel-exemple.fr'],
    scanIntent: 'full-audit',
    seeds: [],
    exclusions: [],
    externalTransactionalFlows: [],
    bounds: {
      maxPages: { value: 200, origin: 'implementation-default' },
      maxDepth: { value: 4, origin: 'implementation-default' },
      crawlDelayMs: 1000,
      scanConcurrency: 1,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 120_000,
      renderSettleTimeoutMs: 5000,
    },
    sitemapMode: 'supplement',
    expectedLanguages: [],
    networkPolicyId: PUBLIC_SITE_NETWORK_POLICY.id,
    ...overrides,
  });
}

interface Extra {
  url: string;
  disposition: InventoryDisposition;
}

export function inventory(frozen: AuditScopeSnapshot, extra: readonly Extra[] = []) {
  const ledger = new InventoryLedger({ evidenceEpoch: 1, scopeDigest: frozen.digest });
  ledger.recordDiscovery({ url: HOME, source: 'start', discoveredAt: AT, depth: 0 });
  ledger.recordDiscovery({
    url: ROOMS,
    source: 'link',
    discoveredAt: AT,
    referrer: HOME,
    depth: 1,
  });
  for (const { url } of extra) {
    ledger.recordDiscovery({ url, source: 'link', discoveredAt: AT, referrer: HOME, depth: 1 });
  }
  ledger.recordDisposition({ url: HOME, disposition: 'scanned', decidedAt: AT });
  ledger.recordDisposition({ url: ROOMS, disposition: 'scanned', decidedAt: AT });
  for (const { url, disposition } of extra) {
    ledger.recordDisposition({ url, disposition, decidedAt: AT });
  }
  return ledger.snapshot();
}

export function attempt(
  checkId: string,
  target: AcquisitionAttemptRecord['target'],
  overrides: Partial<AcquisitionAttemptRecord> = {},
  scopeDigest = scope().digest,
): AcquisitionAttemptRecord {
  const key = target.kind === 'site' ? target.origin : target.url;
  return {
    checkId,
    target,
    surfaceId: target.kind === 'site' ? SITE_REQUEST_SURFACE_ID : SURFACE,
    scopeDigest,
    evidenceEpoch: 1,
    startedAt: '2026-09-18T09:01:00.000Z',
    finishedAt: '2026-09-18T09:01:30.000Z',
    executionProfile: 'normal',
    sourceArtifactDigest: `sha256:artifact-${checkId}-${key}`,
    outcome: 'succeeded',
    materialResultDigest: `sha256:material-${checkId}-${key}`,
    ...overrides,
  } as AcquisitionAttemptRecord;
}

export function cleanAttempts(urls: readonly string[] = [HOME, ROOMS]): AcquisitionAttemptRecord[] {
  return [
    ...urls.flatMap((url) =>
      PAGE_CHECK_IDS.map((checkId) => attempt(checkId, { kind: 'page', url })),
    ),
    ...REQUIRED_SITE_CHECK_IDS.map((checkId) => attempt(checkId, { kind: 'site', origin: ORIGIN })),
  ];
}

export function page(url: string, frames: FrameObservation[] = []): EvidencePageObservation {
  return {
    url,
    readiness: {
      navigationMilestone: 'load',
      httpStatus: 200,
      domReady: true,
      fontsReady: true,
      networkQuiet: true,
      mutationQuiescent: true,
      significantResourceFailures: [],
      outcome: 'ready',
    },
    frames,
  };
}

export function finding(overrides: Partial<Finding> & Pick<Finding, 'ruleId'>): Finding {
  return {
    findingId: `finding-${overrides.ruleId}`,
    auditId: AUDIT_ID,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: '',
    description: '',
    pageUrls: [HOME],
    occurrences: 1,
    elements: [{ pageUrl: HOME, selector: 'img.hero', snippet: '<img class="hero">' }],
    rawEvidence: {},
    dedupeKey: `dedupe-${overrides.ruleId}`,
    firstSeenAt: AT,
    lastSeenAt: AT,
    ...overrides,
  };
}

export const AXE_FINDING = finding({ ruleId: 'image-alt' });
export const HEURISTIC_FINDING = finding({
  ruleId: 'alt-text-quality-heuristic',
  source: 'custom',
  severity: 'minor',
});

/** The environment fingerprint's raw input, exported so a fault case can
 *  re-fingerprint one field (a normalization or tool version change) and have
 *  the digest recomputed honestly rather than patched in place. */
export function environmentInput(): AuditEnvironmentFingerprintInput {
  return {
    build: {
      odysseusBuildId: 'test-build',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      normalizationFingerprint: NORMALIZATION_FINGERPRINT,
    },
    runtime: {
      nodeVersion: 'v22.12.0',
      platform: 'linux',
      architecture: 'x64',
      kernelRelease: '6.6',
      kernelFlavour: null,
      logicalCoreClass: '9-16',
      memoryClass: '16-32gb',
      containerProfileId: 'test-container',
    },
    tools: {
      playwrightVersion: '1.56.0',
      chromiumVersion: '141.0.7390.54',
      axeCoreVersion: '4.10.2',
      lighthouseVersion: '12.2.1',
    },
    browser: {
      isolationProfile: 'chromium-sandbox',
      declaredIsolationProfileId: null,
      launchFlagNames: [],
      userAgent: 'OdysseusBot/1.0',
    },
    surfaces: [
      {
        id: 'baseline-desktop',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        hasTouch: false,
      },
    ],
    locale: { locale: 'chromium-default', acceptLanguage: 'chromium-default', timezone: 'UTC' },
    networkPolicyId: PUBLIC_SITE_NETWORK_POLICY.id,
    lighthouse: {
      formFactor: 'mobile',
      throttlingMethod: 'simulate',
      throttlingProfileId: 'lighthouse-default-mobile',
      categories: ['performance', 'seo'],
      maxWaitForLoadMs: 120_000,
    },
    timings: {
      pageTimeoutMs: 30_000,
      renderSettleTimeoutMs: 5000,
      lighthouseTimeoutMs: 120_000,
      crawlDelayMs: 1000,
      scanConcurrency: 1,
    },
    registries: { capabilityRegistryVersion: 'test', checkRegistryVersion: 'test' },
  };
}

export function cleanInput(
  overrides: Partial<AuditEvidenceGraphInput> = {},
): AuditEvidenceGraphInput {
  const frozen = scope();
  return {
    auditId: AUDIT_ID,
    scope: frozen,
    networkPolicy: PUBLIC_SITE_NETWORK_POLICY,
    robotsChain: [
      buildRobotsPolicySnapshot({
        evidenceEpoch: 1,
        revision: 0,
        origin: ORIGIN,
        userAgent: 'OdysseusBot/1.0',
        robotsText: 'User-agent: *\nAllow: /',
        retrievedAt: AT,
        rules: { found: true, disallow: [], allow: ['/'], sitemapUrls: [] },
        configuredDelayMs: 1000,
      }),
    ],
    inventory: inventory(frozen),
    attempts: cleanAttempts(),
    pages: [page(HOME), page(ROOMS)],
    findings: [AXE_FINDING],
    environment: buildAuditEnvironmentFingerprint(environmentInput()),
    isolation: { ok: true, profile: 'chromium-sandbox', findings: [] },
    configDigest: 'sha256:config',
    temporalCoherence: {
      status: 'coherent',
      startedAt: '2026-09-18T09:00:00.000Z',
      finishedAt: '2026-09-18T09:30:00.000Z',
    },
    assessedAt: '2026-09-18T09:31:00.000Z',
    systemVersion: 'test-build',
    ...overrides,
  };
}
