/**
 * What produced the evidence, and whether two runs' evidence can be compared
 * at all (plan 059 sections 5.17 and 5.18).
 *
 * Almost every number a full audit reports is a measurement of a site *and*
 * of the machine that measured it. A Lighthouse LCP moves with the host's
 * CPU class and throttling profile. An axe finding count moves with the
 * axe-core version and with whether the run could traverse open shadow roots.
 * A page that was never rendered at mobile width cannot report a mobile-only
 * defect. When the environment is not recorded, all of that arrives at the
 * client as their own site getting worse or better, which is the single most
 * expensive kind of wrong this product can be: it invoices a regression that
 * a scanner upgrade invented.
 *
 * `AuditEnvironmentFingerprint` is the record of the measuring apparatus.
 * `EvidenceCoverageSignature` is the narrower question of observability, and
 * the two are deliberately separate artifacts. The fingerprint changes when
 * anything about the environment changes, including things that cannot move a
 * result (a Node patch release, a different memory class). The coverage
 * signature changes only when the *set of facts the audit was able to observe*
 * changes. Comparing two runs through the fingerprint would declare almost
 * every pair incomparable; comparing them through the coverage signature
 * declares incomparable exactly the slices that are.
 *
 * Neither artifact is a finding identity. `dedupeKey` remains the identity of
 * a finding, and nothing here alters it. The coverage signature answers only
 * whether the presence or the absence of a finding in one run may be read
 * against the other run (section 16).
 *
 * The second failure designed against is disclosure. This fingerprint is
 * stored inside evidence artifacts, which are read back by the report package
 * and can end up in front of an operator's client. So it records stable
 * profile identifiers and coarse classes, never infrastructure identity: no
 * hostname, no address, no absolute path, no username, no container id and no
 * environment variable value. Where exactness would identify a host without
 * improving comparability - the total byte count of RAM, the logical core
 * count, the kernel patch level - the field is a class instead. That is also
 * what makes the digest stable: two runs on identically provisioned hosts
 * fingerprint the same, which is the property cross-run comparison needs.
 * `findHostIdentifyingValues` enforces the rule by shape at build time rather
 * than trusting every future caller to remember it.
 *
 * Deliberately a pure builder over a described environment, with the reading
 * of the real process confined to `describeCurrentRuntimeProfile`. A test has
 * to be able to construct a 96-core host, a kernel flavour it is not running,
 * or a caller that tried to pass a path, without being any of those.
 */

import { cpus, release, totalmem } from 'node:os';
import {
  canonicalDigest,
  FINDINGS_SCHEMA_VERSION,
  NORMALIZATION_FINGERPRINT,
} from '@odysseus/core';
import { readOdysseusBuildId } from './artifacts/manifest.js';
import type { CollectedToolVersions } from './artifacts/versions.js';
import type { BrowserIsolationProfile } from './browser-isolation-preflight.js';

export const AUDIT_ENVIRONMENT_FINGERPRINT_VERSION = 'audit-environment-v1';
export const EVIDENCE_COVERAGE_SIGNATURE_VERSION = 'evidence-coverage-signature-v1';

/* ------------------------------------------------------------------ *
 * Coarse classes
 * ------------------------------------------------------------------ */

/**
 * Buckets rather than counts, for two reasons that point the same way. A run
 * on a 12-core host and a run on a 16-core host are equally capable of the
 * measurements this scanner makes, so recording the difference only adds
 * digest churn; and an exact core count plus an exact byte count of RAM is a
 * usable fingerprint of one specific machine in a small fleet.
 */
export type LogicalCoreClass = '1-2' | '3-4' | '5-8' | '9-16' | '17-32' | '33-plus';

export type MemoryClass = 'under-4gb' | '4-8gb' | '8-16gb' | '16-32gb' | '32-64gb' | '64gb-plus';

export function classifyLogicalCores(count: number): LogicalCoreClass {
  if (count <= 2) return '1-2';
  if (count <= 4) return '3-4';
  if (count <= 8) return '5-8';
  if (count <= 16) return '9-16';
  if (count <= 32) return '17-32';
  return '33-plus';
}

const BYTES_PER_GIB = 1024 ** 3;

export function classifyMemory(totalBytes: number): MemoryClass {
  const gib = totalBytes / BYTES_PER_GIB;
  // Compared against a threshold slightly under the nominal size because a
  // host advertised as 8 GB reports a little less once firmware reservations
  // are taken out, and a machine must not drift between classes on a reboot.
  if (gib < 3.8) return 'under-4gb';
  if (gib < 7.8) return '4-8gb';
  if (gib < 15.8) return '8-16gb';
  if (gib < 31.8) return '16-32gb';
  if (gib < 63.8) return '32-64gb';
  return '64gb-plus';
}

/**
 * Splits a kernel release into the part that describes the platform and the
 * part that describes one build of it.
 *
 * Only the major and minor are kept. A kernel patch level changes under an
 * unattended upgrade without changing anything this scanner can observe, and
 * carrying it would mean two runs a week apart on the same host never share a
 * fingerprint. The non-numeric suffix is kept because it does say something:
 * `microsoft-standard-WSL2` and `generic` are genuinely different measurement
 * platforms.
 */
export function coarsenKernelRelease(value: string): { release: string; flavour: string | null } {
  const [version = '', ...rest] = value.trim().split('-');
  const [major = '0', minor = '0'] = version.split('.');
  const flavour = rest.filter((part) => !/^\d+$/u.test(part)).join('-');
  return { release: `${major}.${minor}`, flavour: flavour === '' ? null : flavour };
}

/**
 * Reduces launch arguments to the set of flag names, dropping every value.
 *
 * Values are the part that cannot safely be stored. `--user-data-dir` carries
 * an absolute path, `--remote-debugging-port` carries a port chosen freshly at
 * every launch, and a proxy flag carries an address. Names are also the part
 * that carries the meaning worth comparing across runs: `--no-sandbox` and
 * `--disable-web-security` change what a scanned page may do, and they take no
 * value at all.
 *
 * The accepted loss is a flag whose value is behaviour-relevant, such as a
 * `--js-flags` payload. Nothing in this scanner passes one today; if that
 * changes, the fix is an explicit allowlist of value-carrying flags, not
 * storing every value.
 */
export function normalizeLaunchFlagNames(args: readonly string[]): readonly string[] {
  const names = new Set<string>();
  for (const arg of args) {
    if (!arg.startsWith('-')) continue;
    const [name = ''] = arg.split('=');
    const trimmed = name.trim();
    if (trimmed !== '') names.add(trimmed);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

/* ------------------------------------------------------------------ *
 * The fingerprint
 * ------------------------------------------------------------------ */

export interface OdysseusBuildProfile {
  /** Short commit or the `unknown` sentinel, resolved by the same reader the
   *  manifest already uses so an artifact and its manifest can never disagree
   *  about which build produced them. */
  odysseusBuildId: string;
  /** Numeric, matching `FINDINGS_SCHEMA_VERSION`'s own type in core. */
  findingsSchemaVersion: number;
  normalizationFingerprint: string;
}

export interface RuntimeProfile {
  nodeVersion: string;
  platform: string;
  architecture: string;
  kernelRelease: string;
  kernelFlavour: string | null;
  logicalCoreClass: LogicalCoreClass;
  memoryClass: MemoryClass;
  /** A stable identifier for how the process is contained, declared by the
   *  deployment rather than derived: a container id would identify one host,
   *  and a cgroup path is a filesystem path. */
  containerProfileId: string;
}

export interface BrowserProfile {
  isolationProfile: BrowserIsolationProfile;
  /** The operator's attestation where the platform cannot run Chromium's own
   *  sandbox, from `APPROVED_ISOLATION_PROFILES`. */
  declaredIsolationProfileId: string | null;
  /** Flag names only; see `normalizeLaunchFlagNames`. */
  launchFlagNames: readonly string[];
  userAgent: string;
}

/**
 * One rendering surface the run was configured to capture. The identifier is
 * the same stable surface id plan 059 section 5.5 puts on `ScanSurface`, so a
 * coverage signature can name a surface the fingerprint also describes.
 */
export interface SurfaceRenderProfile {
  id: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  hasTouch: boolean;
  prefersColorScheme?: 'light' | 'dark' | 'no-preference';
  prefersReducedMotion?: 'reduce' | 'no-preference';
}

export interface LocaleProfile {
  /** BCP-47 tag the browser context was created with. */
  locale: string;
  acceptLanguage: string;
  /** IANA zone name. Recorded because a site can serve different content by
   *  local time, not because the operator's whereabouts are interesting. */
  timezone: string;
}

export interface LighthouseRunProfile {
  formFactor: 'mobile' | 'desktop';
  throttlingMethod: 'simulate' | 'devtools' | 'provided';
  /** Names the throttling numbers as a unit. A run measured under a different
   *  throttling profile is a different measurement, whatever the site did. */
  throttlingProfileId: string;
  categories: readonly string[];
  maxWaitForLoadMs: number;
}

/**
 * How long the run was willing to wait, at each point where waiting longer
 * changes what gets measured.
 *
 * These numbers also appear on `AuditScopeSnapshot.bounds`, and the
 * duplication is intended: scope records what the audit was *declared* to
 * allow, and the fingerprint records what the environment actually applied.
 * A resumed audit whose configuration changed between epochs is exactly the
 * case where the two differ and someone needs to see it.
 */
export interface MeasurementTimingProfile {
  pageTimeoutMs: number;
  renderSettleTimeoutMs: number;
  lighthouseTimeoutMs: number;
  crawlDelayMs: number;
  scanConcurrency: number;
}

export interface RegistryVersions {
  /** `AccessibilityCapabilityRegistry` (section 5.16). */
  capabilityRegistryVersion: string;
  /** The compiled check/scope registry that decides which checks run where. */
  checkRegistryVersion: string;
}

export interface AuditEnvironmentFingerprintInput {
  build: OdysseusBuildProfile;
  runtime: RuntimeProfile;
  /** Reused verbatim from `artifacts/versions.ts`, which already collects the
   *  versions the tools themselves report rather than what is installed. */
  tools: CollectedToolVersions;
  browser: BrowserProfile;
  surfaces: readonly SurfaceRenderProfile[];
  locale: LocaleProfile;
  /** Which `NetworkTargetPolicy` profile admitted the run's targets. */
  networkPolicyId: string;
  lighthouse: LighthouseRunProfile;
  timings: MeasurementTimingProfile;
  registries: RegistryVersions;
}

export interface AuditEnvironmentFingerprint extends AuditEnvironmentFingerprintInput {
  version: typeof AUDIT_ENVIRONMENT_FINGERPRINT_VERSION;
  digest: string;
}

/* ------------------------------------------------------------------ *
 * The disclosure guard
 * ------------------------------------------------------------------ */

/** A rooted path under a directory that only exists on a real machine. The
 *  list is of top-level directories rather than `^/` so that a URL path such
 *  as the crawler user agent's `/bot` is not mistaken for a filesystem path. */
const ABSOLUTE_PATH_PATTERN =
  /(?:^|[\s"'=(,;])\/(?:home|root|Users|var|tmp|opt|srv|mnt|media|data|usr|etc|proc|dev|run|snap|private)(?:\/|$)/u;

const WINDOWS_PATH_PATTERN = /(?:^|[\s"'=(,;])[A-Za-z]:[\\/]/u;

const FILE_URL_PATTERN = /file:\/\//iu;

/**
 * A dotted quad whose every octet is in range. The octet bound is what keeps
 * this off version strings: a Chromium version such as `141.0.7390.54` has a
 * build number far above 255, and the other versions recorded here have three
 * components rather than four. A kernel release would collide, which is one
 * more reason `coarsenKernelRelease` reduces it to major and minor.
 */
const IPV4_PATTERN =
  /(?:^|[^\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:[^\d.]|$)/u;

/** Bracketed literals and any run of four or more hex groups. */
const IPV6_PATTERN = /\[[0-9a-f:]{2,}\]|(?:^|[^\w:])(?:[0-9a-f]{1,4}:){4,}[0-9a-f]{1,4}/iu;

function isHostIdentifying(value: string): boolean {
  return (
    ABSOLUTE_PATH_PATTERN.test(value) ||
    WINDOWS_PATH_PATTERN.test(value) ||
    FILE_URL_PATTERN.test(value) ||
    IPV4_PATTERN.test(value) ||
    IPV6_PATTERN.test(value)
  );
}

/**
 * Walks a value and returns the field paths whose contents look like
 * infrastructure identity.
 *
 * Shape detection, not proof. It cannot recognise a hostname passed as a
 * profile id, and it is not meant to: the design defence is that every field
 * is either an enumerated class or an identifier a deployment chose on
 * purpose. What this catches is the accident that actually happens, which is
 * a caller forwarding a raw launch argument, a resolved directory, or a proxy
 * address into an artifact that gets stored and read back.
 */
export function findHostIdentifyingValues(value: unknown, path = ''): readonly string[] {
  if (typeof value === 'string') return isHostIdentifying(value) ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => findHostIdentifyingValues(child, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      findHostIdentifyingValues(child, path === '' ? key : `${path}.${key}`),
    );
  }
  return [];
}

/**
 * Freezes an environment description and content-addresses it.
 *
 * Throws rather than redacting when the guard fires. A redaction would leave a
 * digest that silently disagrees with the environment it claims to describe,
 * and the caller passing the offending value is the only layer that knows what
 * stable identifier belongs there instead.
 *
 * As with `AuditScopeSnapshot`, the digest covers no timestamp. Two runs in the
 * same environment must produce the same digest or none of the cross-run
 * reasoning in section 16 is possible.
 */
export function buildAuditEnvironmentFingerprint(
  input: AuditEnvironmentFingerprintInput,
): AuditEnvironmentFingerprint {
  const body = { ...input, version: AUDIT_ENVIRONMENT_FINGERPRINT_VERSION } as const;
  const identifying = findHostIdentifyingValues(body);
  if (identifying.length > 0) {
    throw new Error(
      'buildAuditEnvironmentFingerprint: refusing to record infrastructure identity in stored ' +
        `evidence; use a stable profile id at ${identifying.join(', ')}`,
    );
  }
  return { ...body, digest: canonicalDigest(body) };
}

export interface DescribeRuntimeProfileOptions {
  containerProfileId: string;
}

/**
 * Reads the parts of the runtime profile that only the live process knows.
 *
 * Everything else the fingerprint needs - launch flags, surfaces, throttling,
 * timings, registry versions - is a decision a caller made and can state,
 * so it is not guessed at here.
 */
export function describeCurrentRuntimeProfile(
  options: DescribeRuntimeProfileOptions,
): RuntimeProfile {
  const kernel = coarsenKernelRelease(release());
  return {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    kernelRelease: kernel.release,
    kernelFlavour: kernel.flavour,
    logicalCoreClass: classifyLogicalCores(cpus().length),
    memoryClass: classifyMemory(totalmem()),
    containerProfileId: options.containerProfileId,
  };
}

/**
 * The build slice, resolved from the same reader `artifacts/manifest.ts` uses.
 *
 * Reusing it rather than resolving the commit again is the point: issue #58 was
 * two resolvers disagreeing about which build produced an artifact, and a
 * fingerprint whose build id differed from its own manifest's would be worse
 * than no fingerprint at all.
 */
export function describeCurrentBuildProfile(): OdysseusBuildProfile {
  return {
    odysseusBuildId: readOdysseusBuildId(),
    findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
    normalizationFingerprint: NORMALIZATION_FINGERPRINT,
  };
}

/* ------------------------------------------------------------------ *
 * The coverage signature
 * ------------------------------------------------------------------ */

/**
 * How deeply a check was able to traverse the document. A check that cannot
 * enter a same-origin frame cannot report what is inside one, so its silence
 * about that region means nothing.
 *
 * The vocabulary belongs to `AccessibilityCapabilityRegistry` (section 5.16).
 * Declared here so this module does not depend on the registry's shape;
 * re-point it at the registry once that lands.
 */
export type FrameTraversalCapability =
  'document-only' | 'open-shadow' | 'same-origin-frames' | 'cross-origin-frames';

/** What one check was able to observe in one run. */
export interface CheckObservability {
  checkId: string;
  /** The implementation version of the check or rule itself. A bump means its
   *  verdict on unchanged input may have changed. */
  version: string;
  /** Surface ids, from `ScanSurface`, on which the check actually ran. */
  surfaces: readonly string[];
  frameCapability: FrameTraversalCapability;
  /** True only where the semantic classifier decides whether the check applies
   *  to a page at all. Section 5.18 restricts the classifier's influence to
   *  exactly this case, because a classifier that only labels a page role
   *  changes explanation, not observability. */
  semanticallyConditional: boolean;
}

/**
 * The normalization contract under which findings were derived. A change here
 * can move `dedupeKey` itself, so it is the one slice that makes every check
 * incomparable at once.
 */
export interface NormalizationContract {
  findingsSchemaVersion: number;
  normalizationFingerprint: string;
}

export interface EvidenceCoverageSignatureInput {
  /** `AuditScopeSnapshot.digest`: what the run was asked to cover. */
  scopeDigest: string;
  /** Content address of the reconciled inventory: what it actually covered. */
  inventorySignature: string;
  capabilityRegistryVersion: string;
  semanticClassifierVersion: string;
  normalizationContract: NormalizationContract;
  /** Every surface the run enabled, including ones no check used. */
  enabledSurfaces: readonly string[];
  checks: readonly CheckObservability[];
}

export interface EvidenceCoverageSignature extends EvidenceCoverageSignatureInput {
  version: typeof EVIDENCE_COVERAGE_SIGNATURE_VERSION;
  digest: string;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

/**
 * Freezes an observability description and content-addresses it.
 *
 * Checks and surfaces are sorted, unlike the deliberately order-preserving
 * arrays in `AuditScopeSnapshot`. Order is content there because an operator's
 * seed list is a statement; here it is an artifact of iteration order, and two
 * runs that observed the same things must digest the same.
 */
export function buildEvidenceCoverageSignature(
  input: EvidenceCoverageSignatureInput,
): EvidenceCoverageSignature {
  const body = {
    ...input,
    enabledSurfaces: sortedUnique(input.enabledSurfaces),
    checks: [...input.checks]
      .map((check) => ({ ...check, surfaces: sortedUnique(check.surfaces) }))
      .sort((left, right) => left.checkId.localeCompare(right.checkId)),
    version: EVIDENCE_COVERAGE_SIGNATURE_VERSION,
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

export type CoverageIncomparabilityReason =
  | 'normalization-contract-changed'
  | 'check-absent-in-current'
  | 'check-version-changed'
  | 'semantic-classifier-changed'
  | 'frame-capability-changed'
  | 'surface-absent-in-current';

export type NewlyObservableReason = 'check-absent-in-baseline' | 'surface-absent-in-baseline';

/**
 * The three answers section 16 allows before a re-audit may speak of new,
 * resolved or persistent findings.
 *
 * `newly-observable` is the one that earns this module its place. A finding
 * the current run reports from a check or a surface the baseline never had is
 * not a regression on the client's site; it is Odysseus seeing further than it
 * used to. Reporting it as new is the failure this prevents.
 */
export type CheckComparability =
  | { kind: 'comparable' }
  | { kind: 'newly-observable'; reason: NewlyObservableReason }
  | { kind: 'not-comparable'; reason: CoverageIncomparabilityReason };

function findCheck(
  signature: EvidenceCoverageSignature,
  checkId: string,
): CheckObservability | undefined {
  return signature.checks.find((check) => check.checkId === checkId);
}

function sameNormalizationContract(
  baseline: EvidenceCoverageSignature,
  current: EvidenceCoverageSignature,
): boolean {
  return (
    baseline.normalizationContract.findingsSchemaVersion ===
      current.normalizationContract.findingsSchemaVersion &&
    baseline.normalizationContract.normalizationFingerprint ===
      current.normalizationContract.normalizationFingerprint
  );
}

type CheckMatch =
  | { matched: true; before: CheckObservability; after: CheckObservability }
  | { matched: false; comparability: CheckComparability };

/**
 * Everything both comparisons below have to settle before either one can look
 * at surfaces: whether the runs share a normalization contract, whether both
 * ran the check at all, and whether the check itself is still the same
 * instrument.
 *
 * The order is the order of how much each difference invalidates. A changed
 * normalization contract means the two runs do not even agree on what makes
 * two findings the same, so it answers first and for every check. A check
 * missing from the baseline comes next, because that is the scanner-upgrade
 * case and it must not fall through into a version or capability comparison
 * that has no baseline to compare against.
 *
 * Note what is deliberately absent. A bumped capability-registry version is
 * not consulted: the registry is versioned as a whole, so one check gaining a
 * capability would otherwise make every unrelated check incomparable and
 * silence an entire re-audit. The per-check `version` and `frameCapability`
 * carry that same information precisely. Nor is a changed scope or inventory
 * signature: a site that grew has more pages to compare, not less comparable
 * checks, and `compareEvidenceCoverage` surfaces the change for disclosure and
 * rescoped pairing instead.
 */
function matchCheckAcrossRuns(
  baseline: EvidenceCoverageSignature,
  current: EvidenceCoverageSignature,
  checkId: string,
): CheckMatch {
  const refuse = (reason: CoverageIncomparabilityReason): CheckMatch => ({
    matched: false,
    comparability: { kind: 'not-comparable', reason },
  });

  if (!sameNormalizationContract(baseline, current)) {
    return refuse('normalization-contract-changed');
  }

  const before = findCheck(baseline, checkId);
  const after = findCheck(current, checkId);

  if (before === undefined) {
    return {
      matched: false,
      comparability: { kind: 'newly-observable', reason: 'check-absent-in-baseline' },
    };
  }
  if (after === undefined) return refuse('check-absent-in-current');
  if (before.version !== after.version) return refuse('check-version-changed');
  if (
    (before.semanticallyConditional || after.semanticallyConditional) &&
    baseline.semanticClassifierVersion !== current.semanticClassifierVersion
  ) {
    return refuse('semantic-classifier-changed');
  }
  if (before.frameCapability !== after.frameCapability) return refuse('frame-capability-changed');
  return { matched: true, before, after };
}

/**
 * Whether one check's findings may be compared between two runs at all.
 *
 * Surfaces are judged asymmetrically here on purpose. A surface the baseline
 * had and the current run does not is lost observability, so nothing the
 * baseline found there may be called resolved. A surface only the current run
 * has does not make the check less comparable: the surfaces both runs share
 * are still shared, and the extra one is an observation-level question that
 * `compareObservationAcrossRuns` answers.
 */
export function compareCheckAcrossRuns(
  baseline: EvidenceCoverageSignature,
  current: EvidenceCoverageSignature,
  checkId: string,
): CheckComparability {
  const match = matchCheckAcrossRuns(baseline, current, checkId);
  if (!match.matched) return match.comparability;

  const lostSurface = match.before.surfaces.some(
    (surface) => !match.after.surfaces.includes(surface),
  );
  if (lostSurface) return { kind: 'not-comparable', reason: 'surface-absent-in-current' };
  return { kind: 'comparable' };
}

export interface ObservationCoordinates {
  checkId: string;
  /** The `ScanSurface` id the observation was made on. */
  surfaceId: string;
}

/**
 * Whether one observation - one check on one surface - may be compared between
 * two runs.
 *
 * This is the entry point for classifying an individual finding, and the
 * surface is required on purpose. The mobile-only case from section 16 is
 * invisible at check level: a check that ran on desktop in both runs and
 * gained a mobile surface is perfectly comparable on desktop and has no
 * baseline at all on mobile, so only a question that names the surface can be
 * answered honestly. Losing an unrelated surface likewise says nothing about
 * the surface being asked about, which is why this does not simply defer to
 * the check-level answer.
 */
export function compareObservationAcrossRuns(
  baseline: EvidenceCoverageSignature,
  current: EvidenceCoverageSignature,
  observation: ObservationCoordinates,
): CheckComparability {
  const match = matchCheckAcrossRuns(baseline, current, observation.checkId);
  if (!match.matched) return match.comparability;

  if (!match.before.surfaces.includes(observation.surfaceId)) {
    return { kind: 'newly-observable', reason: 'surface-absent-in-baseline' };
  }
  if (!match.after.surfaces.includes(observation.surfaceId)) {
    return { kind: 'not-comparable', reason: 'surface-absent-in-current' };
  }
  return { kind: 'comparable' };
}

export interface CheckComparabilityEntry {
  checkId: string;
  comparability: CheckComparability;
}

export interface EvidenceCoverageComparison {
  /** Both runs observed exactly the same things in the same way. */
  identical: boolean;
  /** Declared scope differs. Not incomparability: it means findings must be
   *  paired within the scope both runs covered and the difference disclosed. */
  scopeChanged: boolean;
  /** The reconciled inventory differs, typically a site that gained or lost
   *  pages. Same treatment as scope: rescope and disclose, never a regression. */
  inventoryChanged: boolean;
  /** Recorded for provenance. Deliberately not an incomparability signal on
   *  its own; see `compareCheckAcrossRuns`. */
  capabilityRegistryChanged: boolean;
  /** The one global change that makes every check incomparable. */
  normalizationContractChanged: boolean;
  /** Every check either run knows about, sorted, so a removed check is as
   *  visible as an added one. */
  checks: readonly CheckComparabilityEntry[];
}

/**
 * Compares two runs' observability as a whole, for the re-audit delta step
 * that has to decide what it is allowed to say before it says anything.
 */
export function compareEvidenceCoverage(
  baseline: EvidenceCoverageSignature,
  current: EvidenceCoverageSignature,
): EvidenceCoverageComparison {
  const checkIds = sortedUnique([
    ...baseline.checks.map((check) => check.checkId),
    ...current.checks.map((check) => check.checkId),
  ]);
  return {
    identical: baseline.digest === current.digest,
    scopeChanged: baseline.scopeDigest !== current.scopeDigest,
    inventoryChanged: baseline.inventorySignature !== current.inventorySignature,
    capabilityRegistryChanged:
      baseline.capabilityRegistryVersion !== current.capabilityRegistryVersion,
    normalizationContractChanged: !sameNormalizationContract(baseline, current),
    checks: checkIds.map((checkId) => ({
      checkId,
      comparability: compareCheckAcrossRuns(baseline, current, checkId),
    })),
  };
}
