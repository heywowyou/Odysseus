/**
 * The audit pipeline's evidence-graph step: reads what a full audit
 * persisted, describes the environment the scan actually ran in, assembles
 * the Plan 059 graph and writes it next to the audit's other artifacts.
 *
 * Runs after normalization, because the audit root binds the normalized
 * findings, and before the artifact directory is synced, so the graph travels
 * with the audit. Only full audits persist a frozen scope and an inventory
 * ledger; any other run gets no graph and keeps the legacy evidence path.
 */
import { canonicalDigest, type Finding } from '@odysseus/core';
import { ACCESSIBILITY_CAPABILITY_REGISTRY } from '../accessibility-capabilities.js';
import {
  buildAuditEnvironmentFingerprint,
  describeCurrentBuildProfile,
  describeCurrentRuntimeProfile,
  normalizeLaunchFlagNames,
  type MeasurementTimingProfile,
} from '../audit-environment-fingerprint.js';
import {
  assessBrowserIsolation,
  describeCurrentBrowserEnvironment,
} from '../browser-isolation-preflight.js';
import { CHECK_SCOPE_REGISTRY } from '../check-scope-coverage.js';
import { assembleAuditEvidenceGraph, type AuditEvidenceGraph } from '../evidence-graph.js';
import { BASELINE_DESKTOP_VIEWPORT } from '../evidence-surfaces.js';
import type { NetworkTargetPolicy } from '../network-target-policy.js';
import { assessTemporalCoherence } from '../temporal-anchors.js';
import { readPersistedEvidenceInputs } from './acquisition-attempts-io.js';
import { writeAuditEvidenceGraph } from './evidence-graph-io.js';
import { readOdysseusBuildId } from './manifest.js';
import type { CollectedToolVersions } from './versions.js';

export interface EvidenceGraphStageInput {
  auditDir: string;
  auditId: string;
  /** The pages the manifest records as visited, whose scan.json files hold
   *  the page attempts and observations. */
  scannedUrls: readonly string[];
  findings: readonly Finding[];
  /** The effective run configuration, as the manifest records it. */
  config: unknown;
  timings: MeasurementTimingProfile;
  tool: CollectedToolVersions;
  /** The Chromium flags the scan's browser was launched with. */
  launchArgs: readonly string[];
  networkPolicy: NetworkTargetPolicy;
  userAgent: string;
  assessedAt: Date;
}

/** Lighthouse runs with its defaults apart from the category list and the
 *  load bound (lighthouse.ts), which is the mobile form factor under
 *  simulated throttling. */
const LIGHTHOUSE_CATEGORIES = ['performance', 'seo'] as const;

export function runEvidenceGraphStage(
  input: EvidenceGraphStageInput,
): AuditEvidenceGraph | undefined {
  const persisted = readPersistedEvidenceInputs(input.auditDir, input.scannedUrls);
  if (persisted.scope === undefined || persisted.inventory === undefined) return undefined;

  const isolation = assessBrowserIsolation(
    describeCurrentBrowserEnvironment({
      chromiumArgs: input.launchArgs,
      networkPolicyId: input.networkPolicy.id,
    }),
  );
  const environment = buildAuditEnvironmentFingerprint({
    build: describeCurrentBuildProfile(),
    runtime: describeCurrentRuntimeProfile({ containerProfileId: 'undeclared' }),
    tools: input.tool,
    browser: {
      isolationProfile: isolation.profile,
      declaredIsolationProfileId: process.env['ODYSSEUS_BROWSER_ISOLATION_PROFILE'] || null,
      launchFlagNames: normalizeLaunchFlagNames(input.launchArgs),
      userAgent: input.userAgent,
    },
    surfaces: [
      {
        id: 'baseline-desktop',
        viewport: BASELINE_DESKTOP_VIEWPORT,
        deviceScaleFactor: 1,
        hasTouch: false,
      },
    ],
    // The browser context sets neither, so Chromium's defaults apply.
    locale: {
      locale: 'chromium-default',
      acceptLanguage: 'chromium-default',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    networkPolicyId: input.networkPolicy.id,
    lighthouse: {
      formFactor: 'mobile',
      throttlingMethod: 'simulate',
      throttlingProfileId: 'lighthouse-default-mobile',
      categories: LIGHTHOUSE_CATEGORIES,
      maxWaitForLoadMs: input.timings.lighthouseTimeoutMs,
    },
    timings: input.timings,
    registries: {
      capabilityRegistryVersion: ACCESSIBILITY_CAPABILITY_REGISTRY.version,
      checkRegistryVersion: canonicalDigest(CHECK_SCOPE_REGISTRY.map((entry) => entry.id)),
    },
  });

  const graph = assembleAuditEvidenceGraph({
    auditId: input.auditId,
    scope: persisted.scope,
    networkPolicy: input.networkPolicy,
    robotsChain: persisted.robotsChain,
    inventory: persisted.inventory,
    attempts: persisted.attempts,
    pages: persisted.pages,
    findings: input.findings,
    environment,
    isolation,
    configDigest: canonicalDigest(input.config),
    temporalCoherence: assessTemporalCoherence({
      // The crawl's own identity for the start page, which the probes use.
      startUrl:
        persisted.inventory.candidates.find((candidate) =>
          candidate.discoveries.some((discovery) => discovery.source === 'start'),
        )?.url ?? persisted.scope.startUrl,
      anchors: persisted.temporalAnchors,
      pageAnchors: persisted.pageAnchors,
    }),
    assessedAt: input.assessedAt.toISOString(),
    systemVersion: readOdysseusBuildId(),
  });
  writeAuditEvidenceGraph(input.auditDir, graph);
  return graph;
}
