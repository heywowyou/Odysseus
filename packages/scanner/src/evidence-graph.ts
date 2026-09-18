/**
 * Assembles one full audit's Plan 059 evidence graph (sections 5.9, 5.11 to
 * 5.13, 5.19 to 5.21, 14, 15 and 21) from what the scan persisted, and
 * decides whether the system may approve it for Plan 058.
 *
 * Everything here is a pure function of its input. The audit stage reads the
 * persisted scope, inventory, robots chain, attempt records and per-page
 * readiness/frame observations off disk and passes them in, so the verdict
 * for one set of artifacts is the same whenever it is recomputed.
 *
 * The order is fixed by the hashing rules. The raw root covers acquisition
 * lineage only and never the verdict; observations derive from the raw root;
 * the audit root binds raw, observations, confirmed findings and signals; the
 * quality assessment references the audit root; approval references all
 * three. Approval exists only when the assessment is reportable, and every
 * blocking condition in section 21 that this build can detect keeps it
 * absent. A condition that was not measured (temporal coherence without its
 * anchors) is not assumed satisfied: its absence is itself blocking.
 */
import {
  buildFindingsProvenance,
  canonicalDigest,
  FINDINGS_DELTA_COVERAGE_VERSION,
  type AuditScopeSnapshot,
  type DeltaObservationCoordinates,
  type EvidenceCoverageSignature as ReportEvidenceCoverageSignature,
  type EvidenceLimitation,
  type FindingsDeltaCoverage,
  type Finding,
  type Sha256Digest,
} from '@odysseus/core';
import { ACCESSIBILITY_CAPABILITY_REGISTRY } from './accessibility-capabilities.js';
import {
  buildEvidenceCoverageSignature,
  type AuditEnvironmentFingerprint,
} from './audit-environment-fingerprint.js';
import type { BrowserIsolationPreflightResult } from './browser-isolation-preflight.js';
import {
  attemptSelectionKey,
  checkAttemptLedgerDigest,
  type AcquisitionAttemptRecord,
  type AttemptFailureClass,
  type AttemptSetResolution,
  type CheckAttempt,
  type CheckAttemptLedger,
} from './check-attempt-ledger.js';
import {
  assembleCheckAttemptLedger,
  PAGE_CHECK_IDS,
  REQUIRED_SITE_CHECK_IDS,
  SITE_REQUEST_SURFACE_ID,
} from './evidence-acquisition.js';
import {
  buildAuditSignal,
  buildEvidenceCoverageLedger,
  buildObservationLedger,
  buildObservationRecord,
  type AuditSignal,
  type EvidenceCoverageEntry,
  type EvidenceCoverageGap,
  type EvidenceCoverageLedger,
  type EvidenceCoverageLimitation,
  type EvidenceCoverageOutcome,
  type ObservationLedger,
  type ObservationRecord,
} from './evidence-ledger.js';
import {
  buildAuditEvidenceSnapshot,
  buildEvidenceQualityAssessment,
  buildRawEvidenceSnapshot,
  produceApprovedAuditEvidence,
  runEvidenceConsistencyGate,
  type AuditEvidenceSnapshot,
  type EvidenceQualityAssessment,
  type EvidenceQualityIssue,
  type ProducedApprovedAuditEvidence,
  type RawEvidenceSnapshot,
  type TemporalCoherenceResult,
} from './evidence-snapshots.js';
import {
  buildFrameCoverageRecord,
  buildPageReadinessRecord,
  capabilityTraversalLevel,
  MOBILE_UA_NEGOTIATION_LIMITATION,
  type FrameCoverageRecord,
  type PageReadinessRecord,
  type ScanSurface,
} from './evidence-surfaces.js';
import { HYDRATION_BOUND_LIMITATION, type HydrationSweepRecord } from './hydration-sweep.js';
import {
  inventoryLedgerDigest,
  InventoryLedger,
  type InventoryDisposition,
  type InventoryLedgerSnapshot,
} from './inventory-ledger.js';
import type { NetworkTargetPolicy } from './network-target-policy.js';
import {
  CRAWL_INVENTORY_CHECK_ID,
  findingDisposition,
  observationCheckId,
  ROBOTS_POLICY_CHECK_ID,
  SITE_OBSERVATION_CHECK_IDS,
} from './observation-checks.js';
import type { FrameObservation, RenderedReadinessObservation } from './page-readiness.js';
import type { PerformanceMeasurementSet } from './performance-measurement-set.js';
import type { RobotsPolicyChain } from './robots-policy-snapshot.js';

/** The page-level observations a scan persisted on each scan.json. */
export interface EvidencePageObservation {
  url: string;
  readiness?: RenderedReadinessObservation;
  frames?: readonly FrameObservation[];
  performanceMeasurement?: PerformanceMeasurementSet;
  /** Plan 059 step 10: every non-baseline ScanSurface built for this page
   *  (mobile first; consent and local-state follow). Absent means the run
   *  predated the surface contract or the surface could not run, which the
   *  page's own surfaceLimitations disclose. */
  surfaces?: readonly ScanSurface[];
  /** Plan 059 step 11: the page's bounded hydration sweep, when one ran. */
  hydration?: HydrationSweepRecord;
}

export interface AuditEvidenceGraphInput {
  auditId: string;
  scope: AuditScopeSnapshot;
  networkPolicy: NetworkTargetPolicy;
  robotsChain: RobotsPolicyChain;
  inventory: InventoryLedgerSnapshot;
  attempts: readonly AcquisitionAttemptRecord[];
  pages: readonly EvidencePageObservation[];
  findings: readonly Finding[];
  environment: AuditEnvironmentFingerprint;
  isolation: BrowserIsolationPreflightResult;
  /** Digest of the effective run configuration the manifest records. */
  configDigest: string;
  temporalCoherence: TemporalCoherenceResult;
  assessedAt: string;
  systemVersion: string;
}

export interface AuditEvidenceGraph {
  attemptLedger: CheckAttemptLedger;
  coverage: EvidenceCoverageLedger;
  readinessRecords: readonly PageReadinessRecord[];
  frameRecords: readonly FrameCoverageRecord[];
  signals: readonly AuditSignal[];
  raw: RawEvidenceSnapshot;
  observations: ObservationLedger;
  audit: AuditEvidenceSnapshot;
  quality: EvidenceQualityAssessment;
  /** Plan 059 step 35: this run's observability in the shape the findings
   *  delta compares, carried to the audit's persisted record so a later
   *  re-audit can judge comparability from both runs' evidence. */
  deltaCoverage: FindingsDeltaCoverage;
  /** Present only when the quality verdict is reportable. */
  approval?: ProducedApprovedAuditEvidence;
}

/** Bumped whenever a rule below changes what the system will approve. */
const EVIDENCE_APPROVAL_POLICY_VERSION = 'evidence-approval-policy-v1';

const SEMANTIC_CLASSIFIER_VERSION = 'semantic-classifier-not-run';
const SURFACE_REGISTRY_VERSION = 'surfaces-baseline-desktop-v1';
const REPORT_DESTINATION = 'section-11';

function digestOf(value: unknown): Sha256Digest {
  return canonicalDigest(value) as Sha256Digest;
}

/* ------------------------------------------------------------------ *
 * Mandatory client disclosures
 * ------------------------------------------------------------------ */

/** A set is intact when it belongs to this page, names exactly the
 *  Lighthouse runs the ledger recorded for it, and still hashes to the digest
 *  it was built with. */
function isIntactMeasurementSet(
  set: PerformanceMeasurementSet,
  url: string,
  ledgerRunIds: ReadonlySet<string>,
): boolean {
  const { digest, ...body } = set;
  const runIds = new Set(set.runs.map((run) => run.runId));
  return (
    set.url === url &&
    runIds.size === ledgerRunIds.size &&
    [...runIds].every((runId) => ledgerRunIds.has(runId)) &&
    canonicalDigest(body) === digest
  );
}

function disclosure(
  code: string,
  fr: string,
  en: string,
  evidenceRefs: readonly string[],
): EvidenceLimitation {
  return {
    limitationId: `limitation:${code}`,
    code,
    summary: { fr, en },
    reportDestination: REPORT_DESTINATION,
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
  };
}

/** Picks the singular or plural sentence. Written out in full for both
 *  languages rather than assembled from fragments, so French agreement
 *  (participle, verb, pronoun) is always right. */
function byCount(count: number, one: string, many: (count: number) => string): string {
  return count === 1 ? one : many(count);
}

/** Inventory outcomes that are facts about the site or the declared scope,
 *  each with the sentence the report must print when it occurs. */
const INVENTORY_DISCLOSURES: Partial<
  Record<InventoryDisposition, (count: number) => { code: string; fr: string; en: string }>
> = {
  robots: (count) => ({
    code: 'robots-disallowed-pages',
    fr: byCount(
      count,
      "Une page du site n'a pas été analysée, car son fichier robots.txt en interdit l'accès à notre robot d'analyse.",
      (n) =>
        `${n} pages du site n'ont pas été analysées, car son fichier robots.txt en interdit l'accès à notre robot d'analyse.`,
    ),
    en: byCount(
      count,
      'One page of the site was not analysed because its robots.txt file forbids our crawler from accessing it.',
      (n) =>
        `${n} pages of the site were not analysed because its robots.txt file forbids our crawler from accessing them.`,
    ),
  }),
  'operator-excluded': (count) => ({
    code: 'operator-excluded-pages',
    fr: byCount(
      count,
      "Une page a été exclue du périmètre de l'audit à la demande.",
      (n) => `${n} pages ont été exclues du périmètre de l'audit à la demande.`,
    ),
    en: byCount(
      count,
      'One page was excluded from the audit scope on request.',
      (n) => `${n} pages were excluded from the audit scope on request.`,
    ),
  }),
  'continuation-guard': (count) => ({
    code: 'continuation-family-bound',
    fr: byCount(
      count,
      "Une page appartenant à une série de pages répétitives (pagination, variantes d'une même liste) n'a pas été analysée individuellement ; seule une partie de la série l'a été.",
      (n) =>
        `${n} pages appartenant à des séries de pages répétitives (pagination, variantes d'une même liste) n'ont pas été analysées individuellement ; seule une partie de chaque série l'a été.`,
    ),
    en: byCount(
      count,
      'One page belonging to a repetitive page series (pagination, variants of one listing) was not analysed individually; only part of the series was.',
      (n) =>
        `${n} pages belonging to repetitive page series (pagination, variants of one listing) were not analysed individually; only part of each series was.`,
    ),
  }),
  'http-error-status': (count) => ({
    code: 'site-http-error-pages',
    fr: byCount(
      count,
      'Une page a répondu par une erreur HTTP (par exemple 404) : elle est signalée comme telle, sans analyse de son contenu.',
      (n) =>
        `${n} pages ont répondu par une erreur HTTP (par exemple 404) : elles sont signalées comme telles, sans analyse de leur contenu.`,
    ),
    en: byCount(
      count,
      'One page answered with an HTTP error (for example 404): it is reported as such, without analysis of its content.',
      (n) =>
        `${n} pages answered with an HTTP error (for example 404): they are reported as such, without analysis of their content.`,
    ),
  }),
  'network-safety': (count) => ({
    code: 'network-safety-refused-pages',
    fr: byCount(
      count,
      "Une page n'a pas été analysée, car son adresse menait vers un réseau non public.",
      (n) =>
        `${n} pages n'ont pas été analysées, car leur adresse menait vers un réseau non public.`,
    ),
    en: byCount(
      count,
      'One page was not analysed because its address led to a non-public network.',
      (n) => `${n} pages were not analysed because their address led to a non-public network.`,
    ),
  }),
};

/* ------------------------------------------------------------------ *
 * Coverage from the attempt ledger
 * ------------------------------------------------------------------ */

type NoEvidenceDisposition =
  | { kind: 'fine'; outcome: EvidenceCoverageOutcome }
  | { kind: 'limitation'; outcome: EvidenceCoverageOutcome }
  | { kind: 'gap'; outcome: EvidenceCoverageOutcome };

/** What a check with no accepted evidence means for the audit. A policy or
 *  site answer is a disclosable fact; our own failure is a gap. */
function noEvidenceDisposition(failureClass: AttemptFailureClass): NoEvidenceDisposition {
  switch (failureClass) {
    case 'not-applicable':
      return { kind: 'fine', outcome: 'not-applicable' };
    case 'robots-policy':
      return { kind: 'limitation', outcome: 'robots-disallowed' };
    case 'network-safety-block':
      return { kind: 'limitation', outcome: 'network-safety-blocked' };
    case 'operator-excluded':
      return { kind: 'limitation', outcome: 'operator-excluded' };
    case 'site-http-state':
    case 'soft-error-interstitial':
      return { kind: 'limitation', outcome: 'site-http-state' };
    default:
      return { kind: 'gap', outcome: 'failed' };
  }
}

function targetKeyOf(attempt: Pick<CheckAttempt, 'target'>): string {
  const target = attempt.target;
  if (target.kind === 'site') return `site:${target.origin}`;
  if (target.kind === 'page') return `page:${target.url}`;
  return `performance:${target.url}#${target.performanceProfile}`;
}

interface IssueCollector {
  add(issue: EvidenceQualityIssue): void;
  list(): EvidenceQualityIssue[];
}

/** Issues are merged per code and severity so a thousand failed attempts
 *  become one blocking reason with a thousand evidence references, not a
 *  thousand reasons. */
function createIssueCollector(): IssueCollector {
  const byKey = new Map<string, EvidenceQualityIssue & { refs: Set<string> }>();
  return {
    add(issue) {
      const key = `${issue.code}|${issue.severity}|${issue.summary}`;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, { ...issue, refs: new Set(issue.evidenceRefs) });
      } else {
        for (const ref of issue.evidenceRefs) existing.refs.add(ref);
      }
    },
    list() {
      return [...byKey.values()].map(({ refs, ...issue }) => ({
        ...issue,
        evidenceRefs: [...refs].sort(),
      }));
    },
  };
}

interface Occurrence {
  pageUrl: string;
  selector?: string;
  snippet?: string;
  resourceUrl?: string;
}

interface AttemptIndex {
  /** Accepted attempts per `checkId|targetKey`, surface ignored. Each page
   *  has one baseline surface, and Lighthouse's lab runs are separate
   *  performance targets that all back one page's performance findings. */
  acceptedByCheckTarget: Map<string, CheckAttempt[]>;
  /** Accepted Lighthouse attempts per page URL. */
  acceptedPerformanceByUrl: Map<string, CheckAttempt[]>;
  /** Accepted site-level attempts per check id. */
  acceptedSiteByCheck: Map<string, CheckAttempt[]>;
  /** Selection keys seen per `checkId|page:url`. */
  pageKeysSeen: Set<string>;
  siteChecksSeen: Set<string>;
}

function indexAttempts(
  ledger: CheckAttemptLedger,
  resolutions: ReadonlyMap<string, AttemptSetResolution>,
): AttemptIndex {
  const index: AttemptIndex = {
    acceptedByCheckTarget: new Map(),
    acceptedPerformanceByUrl: new Map(),
    acceptedSiteByCheck: new Map(),
    pageKeysSeen: new Set(),
    siteChecksSeen: new Set(),
  };
  const push = (map: Map<string, CheckAttempt[]>, key: string, attempt: CheckAttempt) => {
    const list = map.get(key) ?? [];
    list.push(attempt);
    map.set(key, list);
  };
  for (const attempt of ledger.attempts) {
    if (attempt.target.kind === 'page') {
      index.pageKeysSeen.add(`${attempt.checkId}|page:${attempt.target.url}`);
    }
    if (attempt.target.kind === 'site') index.siteChecksSeen.add(attempt.checkId);
  }
  for (const resolution of resolutions.values()) {
    if (resolution.kind !== 'accepted') continue;
    const attempt = resolution.attempt;
    push(index.acceptedByCheckTarget, `${attempt.checkId}|${targetKeyOf(attempt)}`, attempt);
    if (attempt.target.kind === 'performance') {
      push(index.acceptedPerformanceByUrl, attempt.target.url, attempt);
    }
    if (attempt.target.kind === 'site') push(index.acceptedSiteByCheck, attempt.checkId, attempt);
  }
  return index;
}

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

export function assembleAuditEvidenceGraph(input: AuditEvidenceGraphInput): AuditEvidenceGraph {
  const evidenceEpoch = input.inventory.evidenceEpoch;
  const issues = createIssueCollector();
  const coverageEntries: EvidenceCoverageEntry[] = [];
  const coverageGaps: EvidenceCoverageGap[] = [];
  const coverageLimitations: EvidenceCoverageLimitation[] = [];

  /* ---- identity checks across the persisted inputs ---------------- */
  const identityProblems: string[] = [];
  if (input.inventory.scopeDigest !== input.scope.digest) {
    identityProblems.push('inventory-scope-mismatch');
  }
  if (input.scope.evidenceEpoch !== evidenceEpoch) identityProblems.push('scope-epoch-mismatch');
  if (input.networkPolicy.id !== input.scope.networkPolicyId) {
    identityProblems.push('network-policy-mismatch');
  }
  if (input.attempts.some((record) => record.scopeDigest !== input.scope.digest)) {
    identityProblems.push('attempt-scope-mismatch');
  }
  if (identityProblems.length > 0) {
    issues.add({
      code: 'raw-evidence-invalid',
      severity: 'blocking',
      resolution: 'impossible',
      summary: 'Persisted evidence does not belong to one frozen scope and evidence epoch.',
      evidenceRefs: identityProblems,
    });
  }

  /* ---- attempt ledger and per-key coverage ------------------------ */
  const epochAttempts = input.attempts.filter((record) => record.evidenceEpoch === evidenceEpoch);
  if (epochAttempts.length !== input.attempts.length) {
    issues.add({
      code: 'raw-evidence-invalid',
      severity: 'blocking',
      resolution: 'impossible',
      summary: 'Attempts from another evidence epoch were persisted with this audit.',
      evidenceRefs: ['attempt-epoch-mismatch'],
    });
  }
  const { ledger, resolutions } = assembleCheckAttemptLedger(evidenceEpoch, epochAttempts);
  const attemptLedgerDigest = checkAttemptLedgerDigest(ledger);
  const attemptsByKey = new Map<string, string[]>();
  for (const attempt of ledger.attempts) {
    const key = attemptSelectionKey(attempt);
    const list = attemptsByKey.get(key) ?? [];
    list.push(attempt.attemptId);
    attemptsByKey.set(key, list);
  }

  const acceptedArtifactDigests: string[] = [];
  const disclosureRefs = new Map<string, { make: () => EvidenceLimitation; refs: Set<string> }>();
  const noteDisclosure = (
    code: string,
    make: (refs: readonly string[]) => EvidenceLimitation,
    ref: string,
  ) => {
    const existing = disclosureRefs.get(code);
    if (existing === undefined) {
      const refs = new Set([ref]);
      disclosureRefs.set(code, { make: () => make([...refs]), refs });
    } else {
      existing.refs.add(ref);
    }
  };

  const attemptById = new Map(ledger.attempts.map((attempt) => [attempt.attemptId, attempt]));
  for (const [key, resolution] of resolutions) {
    const attemptIds = attemptsByKey.get(key) ?? [];
    const sample = attemptById.get(attemptIds[0] ?? '');
    if (sample === undefined) continue;
    const targetKey = targetKeyOf(sample);
    const base = {
      targetKey,
      checkId: sample.checkId,
      surfaceId: sample.surfaceId,
      attemptRefs: attemptIds,
    };
    if (resolution.kind === 'accepted') {
      const artifact = resolution.attempt.sourceArtifactDigest;
      if (artifact !== null) acceptedArtifactDigests.push(artifact);
      coverageEntries.push({
        ...base,
        outcome: 'completed',
        evidenceRefs: artifact === null ? [] : [artifact],
      });
      continue;
    }
    if (resolution.kind === 'unstable-result') {
      coverageEntries.push({
        ...base,
        outcome: 'failed',
        evidenceRefs: resolution.materialResultDigests,
        reasonCode: 'unstable-result',
      });
      coverageGaps.push({
        gapId: `gap:${key}`,
        targetKey,
        checkId: sample.checkId,
        surfaceId: sample.surfaceId,
        materiality: 'material',
        reasonCode: 'unstable-result',
        evidenceRefs: resolution.attemptIds,
      });
      issues.add({
        code: 'unstable-material-result',
        severity: 'blocking',
        resolution: 'operator',
        summary: 'Repeated observations of one check disagree and no attempt may be picked.',
        evidenceRefs: [key],
      });
      continue;
    }
    if (resolution.kind !== 'no-evidence') continue;
    const disposition = noEvidenceDisposition(resolution.failureClass);
    coverageEntries.push({
      ...base,
      outcome: disposition.outcome,
      evidenceRefs: [],
      reasonCode: resolution.failureClass,
    });
    if (disposition.kind === 'fine') continue;
    if (disposition.kind === 'limitation') {
      coverageLimitations.push({
        limitationId: `limitation:${key}`,
        code: disposition.outcome,
        targetKeys: [targetKey],
        evidenceRefs: resolution.attemptIds,
      });
      if (disposition.outcome === 'site-http-state' && sample.target.kind === 'page') {
        noteDisclosure(
          'site-http-state-during-analysis',
          (refs) =>
            disclosure(
              'site-http-state-during-analysis',
              byCount(
                new Set(refs).size,
                "Certaines vérifications n'ont pas pu être menées sur une page, le site ayant répondu par une erreur ou une page d'erreur au moment de l'analyse.",
                (n) =>
                  `Certaines vérifications n'ont pas pu être menées sur ${n} pages, le site ayant répondu par une erreur ou une page d'erreur au moment de l'analyse.`,
              ),
              byCount(
                new Set(refs).size,
                'Some checks could not be run on one page because the site answered with an error or an error page at the time of analysis.',
                (n) =>
                  `Some checks could not be run on ${n} pages because the site answered with an error or an error page at the time of analysis.`,
              ),
              refs,
            ),
          sample.target.url,
        );
      }
      continue;
    }
    coverageGaps.push({
      gapId: `gap:${key}`,
      targetKey,
      checkId: sample.checkId,
      surfaceId: sample.surfaceId,
      materiality: 'material',
      reasonCode: resolution.failureClass,
      evidenceRefs: resolution.attemptIds,
    });
    if (resolution.failureClass === 'anti-bot-rate-limit') {
      issues.add({
        code: 'operator-resolution-required',
        severity: 'blocking',
        resolution: 'operator',
        summary: 'The site rate-limited or walled the crawler; pacing or allowlisting is needed.',
        evidenceRefs: [key],
      });
    } else if (sample.target.kind === 'site') {
      issues.add({
        code: 'site-level-unknown',
        severity: 'blocking',
        resolution: 'system',
        summary: 'A site-level check has no accepted evidence after safe recovery.',
        evidenceRefs: [key],
      });
    } else if (sample.target.kind === 'performance') {
      issues.add({
        code: 'performance-confidence-insufficient',
        severity: 'blocking',
        resolution: 'system',
        summary: 'A selected performance measurement has no accepted run after safe recovery.',
        evidenceRefs: [key],
      });
    } else {
      issues.add({
        code: 'unresolved-material-gap',
        severity: 'blocking',
        resolution: 'system',
        summary: 'A page check has no accepted evidence after safe recovery.',
        evidenceRefs: [key],
      });
    }
  }

  /* ---- inventory reconciliation, truncation and required pages ----- */
  let inventoryLedger: InventoryLedger | undefined;
  try {
    inventoryLedger = InventoryLedger.fromSnapshot(input.inventory);
  } catch {
    issues.add({
      code: 'raw-evidence-invalid',
      severity: 'blocking',
      resolution: 'impossible',
      summary: 'The persisted inventory ledger cannot be restored by this build.',
      evidenceRefs: ['inventory-version-mismatch'],
    });
  }
  const inventoryDigest = inventoryLedgerDigest(input.inventory);
  const candidates = input.inventory.candidates;
  const candidateByUrl = new Map(candidates.map((candidate) => [candidate.url, candidate]));
  const scannedUrls = candidates
    .filter((candidate) => candidate.disposition?.disposition === 'scanned')
    .map((candidate) => candidate.url)
    .sort();

  if (inventoryLedger !== undefined) {
    const reconciliation = inventoryLedger.reconcile();
    if (!reconciliation.reconciled) {
      issues.add({
        code: 'inventory-unreconciled',
        severity: 'blocking',
        resolution: 'system',
        summary: 'Known candidate pages have no terminal inventory disposition.',
        evidenceRefs: reconciliation.unreconciledUrls,
      });
    }
    const truncation = inventoryLedger.assessTruncation(input.scope);
    const omitted = [...truncation.pageCapOmittedUrls, ...truncation.depthBoundOmittedUrls];
    if (truncation.status === 'blocking') {
      issues.add({
        code: 'inventory-unreconciled',
        severity: 'blocking',
        resolution: 'operator',
        summary: 'A default page or depth bound left eligible in-scope pages unscanned.',
        evidenceRefs: omitted,
      });
    } else if (truncation.status === 'disclosable') {
      issues.add({
        code: 'disclosed-scope-limitation',
        severity: 'limitation',
        resolution: 'operator',
        summary: 'An operator-set page or depth bound left eligible pages unscanned.',
        evidenceRefs: omitted,
        disclosure: disclosure(
          'scope-bound-truncation',
          byCount(
            omitted.length,
            "L'analyse a été limitée par un plafond de pages ou de profondeur fixé pour cet audit : une page éligible n'a pas été analysée.",
            (n) =>
              `L'analyse a été limitée par un plafond de pages ou de profondeur fixé pour cet audit : ${n} pages éligibles n'ont pas été analysées.`,
          ),
          byCount(
            omitted.length,
            'The analysis was limited by a page or depth cap set for this audit: one eligible page was not analysed.',
            (n) =>
              `The analysis was limited by a page or depth cap set for this audit: ${n} eligible pages were not analysed.`,
          ),
          omitted,
        ),
      });
    }
  }

  const byDisposition = new Map<InventoryDisposition, string[]>();
  for (const candidate of candidates) {
    const disposition = candidate.disposition?.disposition;
    if (disposition === undefined) continue;
    const list = byDisposition.get(disposition) ?? [];
    list.push(candidate.url);
    byDisposition.set(disposition, list);
  }
  for (const [disposition, urls] of byDisposition) {
    const describe = INVENTORY_DISCLOSURES[disposition];
    if (describe !== undefined) {
      const text = describe(urls.length);
      coverageLimitations.push({
        limitationId: `limitation:inventory:${disposition}`,
        code: text.code,
        targetKeys: urls.map((url) => `page:${url}`),
        evidenceRefs: [inventoryDigest],
      });
      issues.add({
        code: 'disclosed-scope-limitation',
        severity: 'limitation',
        resolution: 'operator',
        summary: `Inventory pages without content evidence: ${disposition}.`,
        evidenceRefs: urls,
        disclosure: disclosure(text.code, text.fr, text.en, urls),
      });
    }
  }
  const scanFailed = byDisposition.get('error') ?? [];
  if (scanFailed.length > 0) {
    for (const url of scanFailed) {
      coverageGaps.push({
        gapId: `gap:inventory:${url}`,
        targetKey: `page:${url}`,
        materiality: 'material',
        reasonCode: 'inventory-scan-failed',
        evidenceRefs: [inventoryDigest],
      });
    }
    issues.add({
      code: 'unresolved-material-gap',
      severity: 'blocking',
      resolution: 'system',
      summary: 'In-scope pages failed to load and hold no evidence.',
      evidenceRefs: scanFailed,
    });
  }

  const startCandidate = candidates.find((candidate) =>
    candidate.discoveries.some((discovery) => discovery.source === 'start'),
  );
  if (startCandidate?.disposition?.disposition !== 'scanned') {
    issues.add({
      code: 'unresolved-material-gap',
      severity: 'blocking',
      resolution: 'system',
      summary: 'The start page was not safely inventoried and scanned.',
      evidenceRefs: [startCandidate?.url ?? input.scope.startUrl],
    });
  }
  const unscannedSeeds = input.scope.seeds
    .map((seed) => seed.url)
    .filter((url) => candidateByUrl.get(url)?.disposition?.disposition !== 'scanned');
  if (unscannedSeeds.length > 0) {
    issues.add({
      code: 'unresolved-material-gap',
      severity: 'blocking',
      resolution: 'operator',
      summary: 'An operator seed page lacks its required scan evidence.',
      evidenceRefs: unscannedSeeds,
    });
  }

  /* ---- every scanned page ran every page check; every site check ran */
  const index = indexAttempts(ledger, resolutions);
  const missingPageChecks: string[] = [];
  for (const url of scannedUrls) {
    for (const checkId of PAGE_CHECK_IDS) {
      if (!index.pageKeysSeen.has(`${checkId}|page:${url}`)) {
        missingPageChecks.push(`${checkId}|page:${url}`);
      }
    }
  }
  if (missingPageChecks.length > 0) {
    for (const key of missingPageChecks) {
      coverageGaps.push({
        gapId: `gap:${key}`,
        targetKey: key.slice(key.indexOf('|') + 1),
        checkId: key.slice(0, key.indexOf('|')),
        materiality: 'material',
        reasonCode: 'no-attempts',
        evidenceRefs: [],
      });
    }
    issues.add({
      code: 'unresolved-material-gap',
      severity: 'blocking',
      resolution: 'system',
      summary: 'A scanned page has no recorded attempt for a registered check.',
      evidenceRefs: missingPageChecks,
    });
  }
  const missingSiteChecks = REQUIRED_SITE_CHECK_IDS.filter(
    (checkId) => !index.siteChecksSeen.has(checkId),
  );
  if (missingSiteChecks.length > 0) {
    issues.add({
      code: 'site-level-unknown',
      severity: 'blocking',
      resolution: 'system',
      summary: 'A required site-level check has no recorded attempt.',
      evidenceRefs: missingSiteChecks,
    });
  }

  /* ---- robots, isolation, temporal coherence ----------------------- */
  const robotsDigest =
    input.robotsChain.length === 0
      ? digestOf({ robotsChain: 'absent' })
      : digestOf(input.robotsChain.map((snapshot) => snapshot.digest));
  if (input.robotsChain.length === 0) {
    issues.add({
      code: 'robots-policy-unresolved',
      severity: 'blocking',
      resolution: 'system',
      summary: 'No robots policy snapshot was persisted for this audit.',
      evidenceRefs: ['robots-policy-chain'],
    });
  }
  if (!input.isolation.ok) {
    issues.add({
      code: 'environment-unapproved',
      severity: 'blocking',
      resolution: 'system',
      summary: 'The browser ran without its sandbox or an approved equivalent isolation profile.',
      evidenceRefs: input.isolation.findings.map((finding) => finding.code),
    });
  }
  if (input.temporalCoherence.status === 'drift-detected') {
    issues.add({
      code: 'temporal-drift',
      severity: 'blocking',
      resolution: 'operator',
      summary: 'The site changed during the audit and old and new evidence cannot be separated.',
      evidenceRefs: [...input.temporalCoherence.materialTargets],
    });
  } else if (input.temporalCoherence.status === 'unknown') {
    issues.add({
      code: 'temporal-coherence-unverified',
      severity: 'blocking',
      resolution: 'system',
      summary: 'The audit cannot show that all of its evidence comes from one site version.',
      evidenceRefs: [input.temporalCoherence.reasonCode],
    });
  }

  /* ---- readiness and frame coverage records ----------------------- */
  const pagesByUrl = new Map(input.pages.map((page) => [page.url, page]));
  const readinessRecords: PageReadinessRecord[] = [];
  const frameRecords: FrameCoverageRecord[] = [];
  const unstablePages: string[] = [];
  const opaqueThirdPartyFrames: string[] = [];
  const unrecordedPages: string[] = [];
  const untraversedFirstPartyFrames: string[] = [];
  for (const url of scannedUrls) {
    const renderAccepted = index.acceptedByCheckTarget.get(`render-diff|page:${url}`)?.[0];
    const axeAccepted = index.acceptedByCheckTarget.get(`axe|page:${url}`)?.[0];
    if (renderAccepted === undefined) continue;
    const surfaceId = renderAccepted.surfaceId;
    const page = pagesByUrl.get(url);
    const readiness = page?.readiness;
    if (readiness === undefined) {
      unrecordedPages.push(url);
    } else {
      readinessRecords.push(
        buildPageReadinessRecord({
          evidenceEpoch,
          pageIdentity: url,
          surfaceId,
          navigationMilestone: readiness.navigationMilestone,
          httpStatus: readiness.httpStatus,
          domReady: readiness.domReady,
          fontsReady: readiness.fontsReady,
          networkQuiet: readiness.networkQuiet,
          mutationQuiescent: readiness.mutationQuiescent,
          hydrationProgress: readiness.hydrationProgress ?? 'not-run',
          significantResourceFailures: readiness.significantResourceFailures,
          outcome: readiness.outcome,
        }),
      );
      if (readiness.outcome !== 'ready') unstablePages.push(url);
    }
    if (axeAccepted === undefined) continue;
    if (page?.frames === undefined) {
      unrecordedPages.push(url);
      continue;
    }
    for (const frame of page.frames) {
      const traversed = frame.axeTraversed ? ['axe'] : [];
      const opaque = !frame.axeTraversed;
      const limitationReason = !opaque
        ? undefined
        : frame.sameOrigin
          ? ('tool-capability' as const)
          : ('cross-origin-opaque' as const);
      frameRecords.push(
        buildFrameCoverageRecord({
          evidenceEpoch,
          pageIdentity: url,
          surfaceId,
          frameUrl: frame.frameUrl,
          frameOrigin: frame.frameOrigin,
          sameOrigin: frame.sameOrigin,
          materiality: frame.materiality,
          traversedCheckIds: traversed,
          ...(limitationReason !== undefined ? { limitationReason } : {}),
          evidenceRefs:
            axeAccepted.sourceArtifactDigest === null ? [] : [axeAccepted.sourceArtifactDigest],
        }),
      );
      if (opaque && frame.materiality !== 'non-material') {
        if (frame.sameOrigin) untraversedFirstPartyFrames.push(`${url}#${frame.frameUrl}`);
        else opaqueThirdPartyFrames.push(`${url}#${frame.frameOrigin}`);
      }
    }
  }
  /* ---- performance measurement sets ------------------------------ */
  // Every page Lighthouse ran on carries one set naming exactly the runs the
  // ledger holds for it, unaltered since it was built. The raw root binds the
  // set, so the representative and its spread are as fixed as the runs.
  const performanceRunsByUrl = new Map<string, Set<string>>();
  for (const attempt of ledger.attempts) {
    if (attempt.target.kind !== 'performance') continue;
    const runs = performanceRunsByUrl.get(attempt.target.url) ?? new Set<string>();
    runs.add(attempt.target.performanceProfile);
    performanceRunsByUrl.set(attempt.target.url, runs);
  }
  const unboundPerformancePages: string[] = [];
  for (const [url, runIds] of [...performanceRunsByUrl].sort(([a], [b]) => a.localeCompare(b))) {
    const set = pagesByUrl.get(url)?.performanceMeasurement;
    if (set === undefined || !isIntactMeasurementSet(set, url, runIds)) {
      unboundPerformancePages.push(url);
      continue;
    }
    acceptedArtifactDigests.push(set.digest);
  }
  if (unboundPerformancePages.length > 0) {
    issues.add({
      code: 'performance-confidence-insufficient',
      severity: 'blocking',
      resolution: 'system',
      summary: 'A measured page has no intact measurement set covering all of its Lighthouse runs.',
      evidenceRefs: unboundPerformancePages,
    });
  }

  /* ---- state surfaces (plan 059 sections 5.5 and 9) ---------------- */
  const surfaces = [
    ...new Map(
      input.pages
        .flatMap((page) => page.surfaces ?? [])
        .map((surface) => [surface.surfaceId, surface]),
    ).values(),
  ].sort((a, b) => a.surfaceId.localeCompare(b.surfaceId));
  for (const surface of surfaces) {
    acceptedArtifactDigests.push(surface.surfaceFingerprint);
  }
  // Section 9: content that kept expanding past the sweep bound is an
  // explicit surface limitation, never an implicit truncation.
  const hydrationBoundPages = input.pages
    .filter((page) => page.hydration?.continuedExpansionAtBound === true)
    .map((page) => page.url)
    .sort();
  if (hydrationBoundPages.length > 0) {
    issues.add({
      code: 'disclosed-scope-limitation',
      severity: 'limitation',
      resolution: 'operator',
      summary: 'Content kept loading past the hydration sweep bound on some pages.',
      evidenceRefs: hydrationBoundPages,
      disclosure: disclosure(
        HYDRATION_BOUND_LIMITATION.code,
        byCount(
          hydrationBoundPages.length,
          "Le contenu d'une page continuait de s'afficher pendant le défilement de notre robot : la page n'a été analysée que jusqu'à la limite de ce balayage.",
          (n) =>
            `Le contenu de ${n} pages continuait de s'afficher pendant le défilement de notre robot : ces pages n'ont été analysées que jusqu'à la limite de ce balayage.`,
        ),
        byCount(
          hydrationBoundPages.length,
          "One page's content kept loading while our crawler scrolled: the page was analysed only up to the bound of that sweep.",
          (n) =>
            `${n} pages' content kept loading while our crawler scrolled: those pages were analysed only up to the bound of that sweep.`,
        ),
        hydrationBoundPages,
      ),
    });
  }
  const mobileSurfaces = surfaces.filter((surface) => surface.hasTouch);
  if (mobileSurfaces.length > 0) {
    // Correction 3.8: the capability language must state, wherever mobile
    // coverage is claimed, that UA-negotiated server-side variants are not
    // tested — the crawler identity never changes.
    issues.add({
      code: 'disclosed-scope-limitation',
      severity: 'limitation',
      resolution: 'operator',
      summary: 'Mobile coverage keeps the crawler identity; UA-negotiated variants are untested.',
      evidenceRefs: mobileSurfaces.map((surface) => surface.surfaceId),
      disclosure: disclosure(
        MOBILE_UA_NEGOTIATION_LIMITATION.code,
        MOBILE_UA_NEGOTIATION_LIMITATION.fr,
        MOBILE_UA_NEGOTIATION_LIMITATION.en,
        mobileSurfaces.map((surface) => surface.surfaceId),
      ),
    });
  }

  if (unrecordedPages.length > 0) {
    issues.add({
      code: 'unresolved-material-gap',
      severity: 'blocking',
      resolution: 'system',
      summary: 'A rendered page has no readiness or frame coverage record.',
      evidenceRefs: unrecordedPages,
    });
  }
  if (untraversedFirstPartyFrames.length > 0) {
    issues.add({
      code: 'unresolved-material-gap',
      severity: 'blocking',
      resolution: 'system',
      summary: 'A material first-party frame was not reached by the accessibility engine.',
      evidenceRefs: untraversedFirstPartyFrames,
    });
  }
  if (opaqueThirdPartyFrames.length > 0) {
    const count = new Set(opaqueThirdPartyFrames).size;
    issues.add({
      code: 'capability-gap-undisclosed',
      severity: 'limitation',
      resolution: 'operator',
      summary: 'Material third-party embedded content could not be inspected.',
      evidenceRefs: opaqueThirdPartyFrames,
      disclosure: disclosure(
        'third-party-frame-opaque',
        byCount(
          count,
          "Un contenu intégré provenant d'un service tiers (réservation, carte, vidéo) n'a pas pu être inspecté par l'analyse automatique d'accessibilité.",
          (n) =>
            `${n} contenus intégrés provenant de services tiers (réservation, carte, vidéo) n'ont pas pu être inspectés par l'analyse automatique d'accessibilité.`,
        ),
        byCount(
          count,
          'One embedded item from a third-party service (booking, map, video) could not be inspected by the automated accessibility analysis.',
          (n) =>
            `${n} embedded items from third-party services (booking, map, video) could not be inspected by the automated accessibility analysis.`,
        ),
        opaqueThirdPartyFrames,
      ),
    });
  }
  if (unstablePages.length > 0) {
    issues.add({
      code: 'unstable-material-result',
      severity: 'limitation',
      resolution: 'operator',
      summary: 'Pages kept changing during analysis; results reflect the observed state.',
      evidenceRefs: unstablePages,
      disclosure: disclosure(
        'page-readiness-unstable',
        byCount(
          unstablePages.length,
          "Une page a continué d'évoluer pendant l'analyse (animations, contenus chargés en continu) : les résultats reflètent l'état observé au moment du passage.",
          (n) =>
            `${n} pages ont continué d'évoluer pendant l'analyse (animations, contenus chargés en continu) : les résultats reflètent l'état observé au moment du passage.`,
        ),
        byCount(
          unstablePages.length,
          'One page kept changing during analysis (animations, continuously loaded content): results reflect the state observed at the time.',
          (n) =>
            `${n} pages kept changing during analysis (animations, continuously loaded content): results reflect the state observed at the time.`,
        ),
        unstablePages,
      ),
    });
  }
  for (const { make } of disclosureRefs.values()) {
    const limitation = make();
    issues.add({
      code: 'disclosed-scope-limitation',
      severity: 'limitation',
      resolution: 'operator',
      summary: `Checks without evidence because of the site's own answer: ${limitation.code}.`,
      evidenceRefs: limitation.evidenceRefs,
      disclosure: limitation,
    });
  }

  const coverage = buildEvidenceCoverageLedger({
    evidenceEpoch,
    inventoryDigest,
    entries: coverageEntries,
    limitations: coverageLimitations,
    unresolvedGaps: coverageGaps,
  });

  /* ---- raw root ---------------------------------------------------- */
  const raw = buildRawEvidenceSnapshot({
    auditId: input.auditId,
    evidenceEpoch,
    scopeDigest: input.scope.digest,
    networkPolicyDigest: digestOf({
      id: input.networkPolicy.id,
      allowsPrivateAddresses: input.networkPolicy.allowsPrivateAddresses,
      allowHosts: [...input.networkPolicy.allowHosts].sort(),
    }),
    robotsPolicyDigest: robotsDigest,
    inventoryDigest,
    attemptLedgerDigest,
    acceptedArtifactDigests,
    evidenceCoverageLedgerDigest: coverage.digest,
    readinessRecordDigests: readinessRecords.map((record) => record.digest),
    frameCoverageRecordDigests: frameRecords.map((record) => record.digest),
    environmentFingerprintDigest: input.environment.digest,
    configFingerprintDigest: input.configDigest,
    temporalCoherence: input.temporalCoherence,
  });

  /* ---- observations, confirmed findings and signals ---------------- */
  const consistencyProblems: string[] = [];
  const records = new Map<string, ObservationRecord>();
  const signals: AuditSignal[] = [];
  const confirmed: Finding[] = [];
  const scannedSet = new Set(scannedUrls);
  const robotsLatest = input.robotsChain[input.robotsChain.length - 1];

  for (const finding of input.findings) {
    if (finding.auditId !== input.auditId) {
      consistencyProblems.push(`finding-audit-mismatch:${finding.findingId}`);
      continue;
    }
    const checkId = observationCheckId(finding);
    if (checkId === undefined) {
      consistencyProblems.push(`finding-check-undeclared:${finding.ruleId}`);
      continue;
    }
    const occurrences: Occurrence[] = finding.elements.map((element) => ({
      pageUrl: element.pageUrl,
      selector: element.selector,
      snippet: element.snippet,
      ...(element.resourceUrl !== undefined ? { resourceUrl: element.resourceUrl } : {}),
    }));
    // A page named by the finding but past the stored element cap, or a
    // finding with no element at all, still gets one page-level observation.
    const pagesWithElements = new Set(occurrences.map((occurrence) => occurrence.pageUrl));
    for (const pageUrl of finding.pageUrls) {
      if (!pagesWithElements.has(pageUrl)) occurrences.push({ pageUrl });
    }

    const observationIds: string[] = [];
    for (const occurrence of occurrences) {
      if (!candidateByUrl.has(occurrence.pageUrl)) {
        consistencyProblems.push(`finding-page-outside-inventory:${occurrence.pageUrl}`);
        continue;
      }
      let accepted: readonly CheckAttempt[] | undefined;
      let sourceArtifactDigest: string | undefined;
      if (checkId === CRAWL_INVENTORY_CHECK_ID) {
        sourceArtifactDigest = inventoryDigest;
      } else if (checkId === ROBOTS_POLICY_CHECK_ID) {
        sourceArtifactDigest = robotsLatest?.digest;
      } else if (checkId === 'lighthouse') {
        accepted = index.acceptedPerformanceByUrl.get(occurrence.pageUrl);
      } else if (SITE_OBSERVATION_CHECK_IDS.has(checkId)) {
        accepted = index.acceptedSiteByCheck.get(checkId);
      } else {
        if (!scannedSet.has(occurrence.pageUrl)) {
          consistencyProblems.push(`finding-page-not-scanned:${occurrence.pageUrl}`);
          continue;
        }
        accepted = index.acceptedByCheckTarget.get(`${checkId}|page:${occurrence.pageUrl}`);
      }
      const attemptRefs =
        accepted !== undefined
          ? accepted.map((attempt) => attempt.attemptId)
          : sourceArtifactDigest !== undefined
            ? [sourceArtifactDigest]
            : [];
      const artifact =
        sourceArtifactDigest ??
        accepted?.map((attempt) => attempt.sourceArtifactDigest).find((value) => value !== null);
      if (attemptRefs.length === 0 || artifact === undefined || artifact === null) {
        consistencyProblems.push(
          `finding-without-accepted-evidence:${finding.ruleId}@${occurrence.pageUrl}`,
        );
        continue;
      }
      const observedAt =
        accepted
          ?.map((attempt) => attempt.finishedAt)
          .sort()
          .at(-1) ?? input.assessedAt;
      const record = buildObservationRecord({
        checkId,
        ruleId: finding.ruleId,
        pageIdentity: occurrence.pageUrl,
        surfaceIds: accepted?.map((attempt) => attempt.surfaceId) ?? [],
        acceptedAttemptRefs: attemptRefs,
        ...(occurrence.selector !== undefined ? { selector: occurrence.selector } : {}),
        ...(occurrence.resourceUrl !== undefined
          ? { resourceIdentity: occurrence.resourceUrl }
          : {}),
        ...(occurrence.snippet !== undefined && occurrence.snippet !== ''
          ? { snippet: occurrence.snippet }
          : {}),
        nativeSeverity: finding.severity,
        observedAt,
        sourceArtifactDigest: artifact,
      });
      records.set(record.observationId, record);
      observationIds.push(record.observationId);
    }

    if (findingDisposition(finding) === 'signal') {
      signals.push(
        buildAuditSignal({
          ruleId: finding.ruleId,
          evidenceRefs: observationIds,
          confidence: 'low',
          reviewStatus: 'unreviewed',
          affectedPageIdentities: finding.pageUrls,
          requiredConfirmationAction: 'manual-review',
        }),
      );
    } else {
      confirmed.push(finding);
    }
  }
  if (consistencyProblems.length > 0) {
    issues.add({
      code: 'consistency-gate-failed',
      severity: 'blocking',
      resolution: 'impossible',
      summary: 'Normalized findings do not all reconcile to accepted scan evidence.',
      evidenceRefs: consistencyProblems,
    });
  }

  const observations = buildObservationLedger({
    evidenceEpoch,
    rawEvidenceSnapshotDigest: raw.digest,
    observations: [...records.values()],
  });

  /* ---- coverage signature (scanner detail, projected for Plan 058) - */
  const checkObservability = [
    ...new Map(
      coverageEntries
        .filter((entry) => entry.outcome === 'completed')
        .map((entry) => [entry.checkId, entry.checkId]),
    ).keys(),
  ].map((checkId) => {
    const capability = ACCESSIBILITY_CAPABILITY_REGISTRY.checks.find(
      (check) => check.checkId === checkId,
    );
    return {
      checkId,
      version: capability?.version ?? `${checkId}-v1`,
      surfaces: [
        ...new Set(
          coverageEntries
            .filter((entry) => entry.checkId === checkId && entry.outcome === 'completed')
            .map((entry) =>
              entry.targetKey.startsWith('page:') ? 'baseline-desktop' : entry.surfaceId,
            ),
        ),
      ],
      frameCapability:
        capability === undefined
          ? ('document-only' as const)
          : capabilityTraversalLevel(capability),
      semanticallyConditional: false,
    };
  });
  const scannerSignature = buildEvidenceCoverageSignature({
    scopeDigest: input.scope.digest,
    inventorySignature: inventoryDigest,
    capabilityRegistryVersion: ACCESSIBILITY_CAPABILITY_REGISTRY.version,
    semanticClassifierVersion: SEMANTIC_CLASSIFIER_VERSION,
    normalizationContract: {
      findingsSchemaVersion: input.environment.build.findingsSchemaVersion,
      normalizationFingerprint: input.environment.build.normalizationFingerprint,
    },
    // The surfaces this audit actually rendered: the desktop baseline every
    // page got, plus the stable profiles observed on at least one page.
    enabledSurfaces: [
      'baseline-desktop',
      ...(mobileSurfaces.length > 0 ? ['mobile-ua-preserving'] : []),
      ...(surfaces.some((surface) => surface.interactionState === 'consent-rejected')
        ? ['consent-rejected']
        : []),
      ...(surfaces.some((surface) => surface.interactionState.startsWith('local-state:'))
        ? ['local-state']
        : []),
    ],
    checks: checkObservability,
  });
  const evidenceCoverageSignature: ReportEvidenceCoverageSignature = {
    digest: scannerSignature.digest as Sha256Digest,
    scopeSignature: input.scope.digest as Sha256Digest,
    checkRegistryVersion: digestOf(
      checkObservability.map((check) => ({ checkId: check.checkId, version: check.version })),
    ),
    surfaceRegistryVersion: SURFACE_REGISTRY_VERSION,
    capabilityRegistryVersion: ACCESSIBILITY_CAPABILITY_REGISTRY.version,
    normalizationContract: input.environment.build.normalizationFingerprint,
  };

  /* Plan 059 step 35: the same observability, in the shape the findings
   * delta compares across runs. Each confirmed finding is pinned to the
   * check and surface whose accepted evidence saw it, so the delta can
   * tell a client regression from Odysseus seeing further than the
   * baseline could. Site-level acquisitions observe on the site-request
   * surface, everything else on the baseline desktop render. */
  const deltaObservations: Record<string, DeltaObservationCoordinates> = {};
  for (const finding of confirmed) {
    const checkId = observationCheckId(finding);
    if (checkId === undefined) continue;
    deltaObservations[finding.dedupeKey] = {
      checkId,
      surfaceId: SITE_OBSERVATION_CHECK_IDS.has(checkId)
        ? SITE_REQUEST_SURFACE_ID
        : 'baseline-desktop',
    };
  }
  const deltaCoverage: FindingsDeltaCoverage = {
    version: FINDINGS_DELTA_COVERAGE_VERSION,
    scopeSignature: input.scope.digest,
    inventorySignature: inventoryDigest,
    capabilityRegistryVersion: ACCESSIBILITY_CAPABILITY_REGISTRY.version,
    semanticClassifierVersion: SEMANTIC_CLASSIFIER_VERSION,
    checks: checkObservability,
    surfaces: [
      ...new Set(['baseline-desktop', ...checkObservability.flatMap((check) => check.surfaces)]),
    ].sort((left, right) => left.localeCompare(right)),
    observations: deltaObservations,
  };

  /* ---- audit root, gate, assessment, approval ---------------------- */
  const audit = buildAuditEvidenceSnapshot({
    auditId: input.auditId,
    evidenceEpoch,
    rawEvidenceSnapshotDigest: raw.digest,
    observationLedgerDigest: observations.digest,
    confirmedFindingsDigest: confirmedFindingsDigest(confirmed),
    signalsDigest: digestOf(signals.map((signal) => signal.digest).sort()),
    pageSemanticProfilesDigest: digestOf([]),
    patternEvidenceDigest: digestOf([]),
    capabilityRegistryVersion: ACCESSIBILITY_CAPABILITY_REGISTRY.version,
    capabilityRegistryDigest: ACCESSIBILITY_CAPABILITY_REGISTRY.digest,
    evidenceCoverageSignature,
  });

  const structural = runEvidenceConsistencyGate({ raw, observations, audit });
  if (!structural.passed) {
    issues.add({
      code: 'consistency-gate-failed',
      severity: 'blocking',
      resolution: 'impossible',
      summary: 'Evidence roots do not reference one another consistently.',
      evidenceRefs: structural.violations.map((violation) => violation.code),
    });
  }

  const quality = buildEvidenceQualityAssessment({
    auditId: input.auditId,
    evidenceEpoch,
    auditEvidenceSnapshotDigest: audit.digest,
    issues: issues.list(),
  });

  const reportable =
    quality.verdict === 'reportable-complete' ||
    quality.verdict === 'reportable-with-known-limitations';
  const approval = reportable
    ? produceApprovedAuditEvidence({
        audit,
        raw,
        assessment: quality,
        approvalMode: 'system',
        approvedAt: input.assessedAt,
        approvedBySystemVersion: `${input.systemVersion}:${EVIDENCE_APPROVAL_POLICY_VERSION}`,
      })
    : undefined;

  return {
    attemptLedger: ledger,
    coverage,
    readinessRecords,
    frameRecords,
    signals,
    raw,
    observations,
    audit,
    quality,
    deltaCoverage,
    ...(approval !== undefined ? { approval } : {}),
  };
}

/** The confirmed-findings digest an approval's audit root binds. Recomputed
 *  by Plan 058's loader so a findings file changed after approval is refused
 *  rather than reported under an approval that never saw it. */
export function confirmedFindingsDigest(findings: readonly Finding[]): string {
  return buildFindingsProvenance(
    findings.filter((finding) => findingDisposition(finding) === 'confirmed'),
  ).findingsDigest;
}
