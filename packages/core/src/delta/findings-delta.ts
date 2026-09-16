/**
 * Findings delta for the paid re-audit (plan 051, design in
 * docs/product/findings-delta-reaudit-design.md). Pure and deterministic:
 * two stored runs of one site go in, and the classified comparison comes
 * out. The model never sees or words any of it.
 *
 * Findings are paired on `dedupeKey`, which normalization emits once per
 * finding and computes the same way on every run, so a key present in both
 * runs is the same rule on the same identity.
 */

import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import { SEVERITY_ORDER } from '../normalize/severity.js';
import type { Finding, Severity } from '../types/findings.js';
import type { AuditConfigSnapshot, ToolVersions } from '../types/manifest.js';

export type FindingsDeltaClass = 'new' | 'resolved' | 'persistent' | 'changed-severity';

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
}

export interface FindingsDeltaSide {
  findingId: string;
  severity: Severity;
  pageCount: number;
}

export interface FindingsDeltaRow {
  class: FindingsDeltaClass;
  dedupeKey: string;
  ruleId: string;
  category: Finding['category'];
  /** Scanner title from the re-audit, or from the baseline for a resolved
   *  finding. */
  title: string;
  baseline?: FindingsDeltaSide;
  current?: FindingsDeltaSide;
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
  /** Sorted: new, changed-severity, resolved, persistent; then severity
   *  descending, then ruleId and dedupeKey. */
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
}

const CLASS_ORDER: Record<FindingsDeltaClass, number> = {
  new: 0,
  'changed-severity': 1,
  resolved: 2,
  persistent: 3,
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

  for (const [key, finding] of after) {
    const prior = before.get(key);
    const base = {
      dedupeKey: key,
      ruleId: finding.ruleId,
      category: finding.category,
      title: finding.title,
      current: side(finding),
    };
    if (prior === undefined) {
      rows.push({ class: 'new', ...base });
      continue;
    }
    const moved = prior.severity !== finding.severity && !changedSeveritySuppressed;
    rows.push({ class: moved ? 'changed-severity' : 'persistent', ...base, baseline: side(prior) });
  }
  for (const [key, prior] of before) {
    if (after.has(key)) continue;
    rows.push({
      class: 'resolved',
      dedupeKey: key,
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
    resolved: 0,
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
  };
}
