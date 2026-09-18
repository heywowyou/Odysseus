/**
 * Findings delta for the paid re-audit (plan 051, design in
 * docs/product/findings-delta-reaudit-design.md). Pure and deterministic:
 * two stored runs of one site go in, and the classified comparison comes
 * out. The model never sees or words any of it.
 *
 * Findings are paired in two passes. First on `dedupeKey`, which
 * normalization emits once per finding and computes the same way on every
 * run, so a key present in both runs is the same rule on the same identity.
 * Then the leftovers: a baseline finding and a re-audit finding of the same
 * rule, category and title on overlapping pages are the same defect, paired
 * greedily by overlap. Shared-scope merging hashes the page list into the
 * key, so a change in the pages reached or still affected moves the key
 * without the site's defect changing; without this pass the delta would call
 * one ongoing defect both fixed and new.
 *
 * Identity is one thing and observability is another (plan 059 sections
 * 5.18 and 16). When both runs carry an `EvidenceCoverageSignature` (as
 * `coverage`), every unpaired row is also judged on whether the baseline
 * could have seen it at all: a current finding from a check or surface the
 * baseline never had is `newly-observable`, not a client regression, and a
 * baseline finding whose check or surface is no longer comparable is
 * `not-comparable`, not resolved. Runs without signatures - every audit
 * that predates the coverage graph - classify exactly as before.
 */

import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import { SEVERITY_ORDER } from '../normalize/severity.js';
import type { Finding, Severity } from '../types/findings.js';
import type { AuditConfigSnapshot, ToolVersions } from '../types/manifest.js';
import {
  compareDeltaCoverageSlices,
  compareDeltaObservationAcrossRuns,
  FINDINGS_DELTA_COVERAGE_VERSION,
  type DeltaCoverageSliceComparison,
  type FindingsDeltaCoverage,
} from './coverage-comparability.js';

export type FindingsDeltaClass =
  'new' | 'newly-observable' | 'resolved' | 'not-comparable' | 'persistent' | 'changed-severity';

export type DeltaFinding = Pick<
  Finding,
  'findingId' | 'ruleId' | 'category' | 'severity' | 'title' | 'pageUrls' | 'dedupeKey'
>;

export interface FindingsDeltaRun {
  auditId: string;
  siteUrl: string;
  /** ISO timestamp of the run's start. */
  startedAt: string;
  tool: ToolVersions;
  config: Pick<AuditConfigSnapshot, 'maxPages' | 'maxDepth'>;
  findingsProvenance: FindingsProvenance;
  findings: readonly DeltaFinding[];
  /** The run's coverage observability, from its persisted evidence. Absent
   *  for an audit that predates the coverage graph; the delta then never
   *  claims observability it cannot support. */
  coverage?: FindingsDeltaCoverage;
}

export interface FindingsDeltaSide {
  findingId: string;
  severity: Severity;
  pageCount: number;
}

export interface FindingsDeltaRow {
  class: FindingsDeltaClass;
  /** The re-audit's key whenever the row has a current side. A persistent
   *  or changed-severity row paired by rule, title and page overlap has a
   *  baseline finding under a different key. */
  dedupeKey: string;
  ruleId: string;
  category: Finding['category'];
  /** Scanner title from the re-audit, or from the baseline for a resolved
   *  finding. */
  title: string;
  baseline?: FindingsDeltaSide;
  current?: FindingsDeltaSide;
  /** Why the row's observability differs between the runs. Present only on
   *  `newly-observable` and `not-comparable` rows, and only when both runs
   *  carried a coverage signature. */
  coverage?: {
    kind: 'newly-observable' | 'not-comparable';
    reason: string;
  };
}

/** Versions whose difference can move findings or severities without the
 *  site changing, so they suppress the changed-severity class. */
const DELTA_GATING_VERSION_FIELDS = [
  'odysseusVersion',
  'findingsSchemaVersion',
  'axeCoreVersion',
  'lighthouseVersion',
] as const;

/** Render context versions: disclosed, never gating. */
const DELTA_DISCLOSED_VERSION_FIELDS = ['playwrightVersion', 'chromiumVersion'] as const;

export type DeltaVersionField =
  (typeof DELTA_GATING_VERSION_FIELDS)[number] | (typeof DELTA_DISCLOSED_VERSION_FIELDS)[number];

export interface DeltaVersionDifference {
  field: DeltaVersionField;
  baseline: string | null;
  current: string | null;
}

export interface DeltaConfigDifference {
  field: 'maxPages' | 'maxDepth';
  baseline: number;
  current: number;
}

export interface FindingsDelta {
  baseline: { auditId: string; startedAt: string };
  /** Sorted: new, newly-observable, changed-severity, resolved,
   *  not-comparable, persistent; then severity descending, then ruleId and
   *  dedupeKey. */
  rows: FindingsDeltaRow[];
  counts: Record<FindingsDeltaClass, number>;
  /** True when a gating version or the normalization changed between the
   *  runs. Rows whose severity moved are then counted as persistent, since
   *  the pair of runs cannot tell a site change from a tooling change. */
  changedSeveritySuppressed: boolean;
  versionDifferences: DeltaVersionDifference[];
  /** The findings schema version or normalization fingerprint differs, so
   *  some keys may have moved without the site changing. */
  normalizationChanged: boolean;
  configDifferences: DeltaConfigDifference[];
  /** Scope, inventory and registry slices of both runs' coverage
   *  signatures, compared for disclosure beside rescoped pairing. Present
   *  only when both runs carried a coverage signature. */
  coverage?: DeltaCoverageSliceComparison;
}

const CLASS_ORDER: Record<FindingsDeltaClass, number> = {
  new: 0,
  'newly-observable': 1,
  'changed-severity': 2,
  resolved: 3,
  'not-comparable': 4,
  persistent: 5,
};

function indexByKey(run: FindingsDeltaRun, label: string): Map<string, DeltaFinding> {
  const byKey = new Map<string, DeltaFinding>();
  for (const finding of run.findings) {
    if (byKey.has(finding.dedupeKey)) {
      throw new Error(
        `Findings delta aborted: the ${label} audit ${run.auditId} has two findings ` +
          `with dedupe key ${finding.dedupeKey}.`,
      );
    }
    byKey.set(finding.dedupeKey, finding);
  }
  return byKey;
}

function side(finding: DeltaFinding): FindingsDeltaSide {
  return {
    findingId: finding.findingId,
    severity: finding.severity,
    pageCount: new Set(finding.pageUrls).size,
  };
}

function pageOverlap(a: DeltaFinding, b: DeltaFinding): number {
  const pages = new Set(a.pageUrls);
  return new Set(b.pageUrls.filter((page) => pages.has(page))).size;
}

/** Second pairing pass over findings the exact-key pass left unpaired: same
 *  rule, category and title with at least one page in common. Candidates
 *  are accepted greedily by overlap, ties broken on the two keys, so the
 *  result never depends on input order and a finding pairs at most once. */
function pairRescopedFindings(
  unpairedBaseline: readonly DeltaFinding[],
  unpairedCurrent: readonly DeltaFinding[],
): Array<[DeltaFinding, DeltaFinding]> {
  const candidates: Array<{ prior: DeltaFinding; finding: DeltaFinding; overlap: number }> = [];
  for (const prior of unpairedBaseline) {
    for (const finding of unpairedCurrent) {
      if (
        prior.ruleId !== finding.ruleId ||
        prior.category !== finding.category ||
        prior.title !== finding.title
      ) {
        continue;
      }
      const overlap = pageOverlap(prior, finding);
      if (overlap > 0) candidates.push({ prior, finding, overlap });
    }
  }
  candidates.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      compareKeys(a.prior.dedupeKey, b.prior.dedupeKey) ||
      compareKeys(a.finding.dedupeKey, b.finding.dedupeKey),
  );

  const usedBaseline = new Set<string>();
  const usedCurrent = new Set<string>();
  const pairs: Array<[DeltaFinding, DeltaFinding]> = [];
  for (const { prior, finding } of candidates) {
    if (usedBaseline.has(prior.dedupeKey) || usedCurrent.has(finding.dedupeKey)) continue;
    usedBaseline.add(prior.dedupeKey);
    usedCurrent.add(finding.dedupeKey);
    pairs.push([prior, finding]);
  }
  return pairs;
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function versionText(value: string | number | null): string | null {
  return value === null ? null : String(value);
}

function rowSeverity(row: FindingsDeltaRow): Severity {
  return (row.current ?? row.baseline)!.severity;
}

export function computeFindingsDelta(
  baseline: FindingsDeltaRun,
  current: FindingsDeltaRun,
): FindingsDelta {
  if (baseline.siteUrl !== current.siteUrl) {
    throw new Error(
      `Findings delta aborted: the baseline audit is for ${baseline.siteUrl}, ` +
        `not ${current.siteUrl}.`,
    );
  }
  if (baseline.auditId === current.auditId) {
    throw new Error('Findings delta aborted: the baseline and the re-audit are the same audit.');
  }

  const versionDifferences: DeltaVersionDifference[] = [
    ...DELTA_GATING_VERSION_FIELDS,
    ...DELTA_DISCLOSED_VERSION_FIELDS,
  ]
    .filter((field) => baseline.tool[field] !== current.tool[field])
    .map((field) => ({
      field,
      baseline: versionText(baseline.tool[field]),
      current: versionText(current.tool[field]),
    }));
  const normalizationChanged =
    baseline.findingsProvenance.findingsSchemaVersion !==
      current.findingsProvenance.findingsSchemaVersion ||
    baseline.findingsProvenance.normalizationFingerprint !==
      current.findingsProvenance.normalizationFingerprint;
  const changedSeveritySuppressed =
    normalizationChanged ||
    versionDifferences.some(({ field }) =>
      (DELTA_GATING_VERSION_FIELDS as readonly string[]).includes(field),
    );
  const configDifferences: DeltaConfigDifference[] = (['maxPages', 'maxDepth'] as const)
    .filter((field) => baseline.config[field] !== current.config[field])
    .map((field) => ({ field, baseline: baseline.config[field], current: current.config[field] }));

  const before = indexByKey(baseline, 'baseline');
  const after = indexByKey(current, 're-audit');
  const rows: FindingsDeltaRow[] = [];

  /* A signature this build does not know is not a signature: an older
   * comparison must never read a future shape and invent meaning for
   * slices it cannot see. Unknown versions degrade to no coverage, which
   * is the shipped Plan-051/054 behavior. */
  const baselineCoverage =
    baseline.coverage?.version === FINDINGS_DELTA_COVERAGE_VERSION ? baseline.coverage : undefined;
  const currentCoverage =
    current.coverage?.version === FINDINGS_DELTA_COVERAGE_VERSION ? current.coverage : undefined;
  const coverageComparable =
    baselineCoverage !== undefined && currentCoverage !== undefined
      ? { baseline: baselineCoverage, current: currentCoverage }
      : undefined;
  const observationClass = (
    finding: DeltaFinding,
    run: 'baseline' | 'current',
  ): FindingsDeltaRow['coverage'] => {
    if (coverageComparable === undefined) return undefined;
    const coordinates = (
      run === 'baseline' ? coverageComparable.baseline : coverageComparable.current
    ).observations?.[finding.dedupeKey];
    if (coordinates === undefined) return undefined;
    const comparability = compareDeltaObservationAcrossRuns(
      coverageComparable.baseline,
      coverageComparable.current,
      coordinates,
    );
    return comparability.kind === 'comparable'
      ? undefined
      : { kind: comparability.kind, reason: comparability.reason };
  };

  const currentRow = (finding: DeltaFinding) => ({
    dedupeKey: finding.dedupeKey,
    ruleId: finding.ruleId,
    category: finding.category,
    title: finding.title,
    current: side(finding),
  });
  const pushPaired = (prior: DeltaFinding, finding: DeltaFinding): void => {
    const moved = prior.severity !== finding.severity && !changedSeveritySuppressed;
    rows.push({
      class: moved ? 'changed-severity' : 'persistent',
      ...currentRow(finding),
      baseline: side(prior),
    });
  };

  const unpairedCurrent: DeltaFinding[] = [];
  for (const [key, finding] of after) {
    const prior = before.get(key);
    if (prior === undefined) unpairedCurrent.push(finding);
    else pushPaired(prior, finding);
  }
  const unpairedBaseline = [...before.values()].filter((prior) => !after.has(prior.dedupeKey));

  const rescopedBaseline = new Set<string>();
  const rescopedCurrent = new Set<string>();
  for (const [prior, finding] of pairRescopedFindings(unpairedBaseline, unpairedCurrent)) {
    rescopedBaseline.add(prior.dedupeKey);
    rescopedCurrent.add(finding.dedupeKey);
    pushPaired(prior, finding);
  }

  for (const finding of unpairedCurrent) {
    if (rescopedCurrent.has(finding.dedupeKey)) continue;
    /* A finding this run saw from a check or surface the baseline never
     * had is Odysseus seeing further, not the site getting worse. One the
     * current instruments can no longer support is not called new either. */
    const observability = observationClass(finding, 'current');
    rows.push({
      class:
        observability?.kind === 'newly-observable'
          ? 'newly-observable'
          : observability?.kind === 'not-comparable'
            ? 'not-comparable'
            : 'new',
      ...(observability !== undefined ? { coverage: observability } : {}),
      ...currentRow(finding),
    });
  }
  for (const prior of unpairedBaseline) {
    if (rescopedBaseline.has(prior.dedupeKey)) continue;
    /* A finding whose check or surface is no longer comparable is not a
     * repair: the current run could not re-check it. */
    const observability = observationClass(prior, 'baseline');
    rows.push({
      class: observability?.kind === 'not-comparable' ? 'not-comparable' : 'resolved',
      ...(observability !== undefined ? { coverage: observability } : {}),
      dedupeKey: prior.dedupeKey,
      ruleId: prior.ruleId,
      category: prior.category,
      title: prior.title,
      baseline: side(prior),
    });
  }

  rows.sort(
    (a, b) =>
      CLASS_ORDER[a.class] - CLASS_ORDER[b.class] ||
      SEVERITY_ORDER[rowSeverity(b)] - SEVERITY_ORDER[rowSeverity(a)] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.dedupeKey.localeCompare(b.dedupeKey),
  );

  const counts: Record<FindingsDeltaClass, number> = {
    new: 0,
    'newly-observable': 0,
    resolved: 0,
    'not-comparable': 0,
    persistent: 0,
    'changed-severity': 0,
  };
  for (const row of rows) counts[row.class] += 1;

  return {
    baseline: { auditId: baseline.auditId, startedAt: baseline.startedAt },
    rows,
    counts,
    changedSeveritySuppressed,
    versionDifferences,
    normalizationChanged,
    configDifferences,
    ...(coverageComparable !== undefined
      ? {
          coverage: compareDeltaCoverageSlices(
            coverageComparable.baseline,
            coverageComparable.current,
          ),
        }
      : {}),
  };
}
