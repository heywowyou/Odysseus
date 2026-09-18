/**
 * Plan 059 step 37: the evidence-quality summary the dashboard surfaces.
 *
 * A full audit's evidence graph is persisted under `<auditDir>/evidence/` with
 * a quality assessment (`evidence-quality-assessment.json`) and, only when the
 * verdict was reportable and every root read back, an approval
 * (`approved-audit-evidence.json`). This module reads those files back and
 * summarizes them to counts and codes only — never raw evidence — and names
 * whether the approval still stands next to the roots it approves, with the
 * exact comparisons the Plan 058 loader (`loadAuditEvidencePayload`) enforces.
 * The dashboard renders the verdict and blocking codes from this summary; the
 * report-quality promotion gate re-checks it so an audit assessed but not
 * approved, or whose approval no longer matches its roots, cannot enter the
 * Plan 058 path silently. Audits without a graph (quick checks, prospecting,
 * pre-059 runs) summarize to `undefined` and keep their existing flows.
 */
import { reportQualityDigest } from '@odysseus/report';
import {
  APPROVED_AUDIT_EVIDENCE_PATH,
  AUDIT_EVIDENCE_SNAPSHOT_PATH,
  buildArtifactBucketKey,
  EVIDENCE_QUALITY_ASSESSMENT_PATH,
  type EvidenceQualityVerdict,
} from '@odysseus/scanner';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';

export type AuditEvidenceApprovalState = 'approved' | 'stale' | 'missing';

/** The whole summary is counts and stable codes: safe to render, safe to
 *  cross the HTTP boundary, never raw evidence content. */
export interface AuditEvidenceQualitySummary {
  verdict: EvidenceQualityVerdict;
  approval: AuditEvidenceApprovalState;
  /** Digest of the standing approval, in the same canonical form the
   *  report-quality bundle's `approvedEvidenceDigest` pins. Present only
   *  when `approval` is `approved`. */
  approvalDigest?: string;
  /** Distinct blocking issue codes, sorted. */
  blockingCodes: string[];
  /** Evidence-reference count behind each blocking code. */
  blockingCounts: Record<string, number>;
  /** Number of mandatory disclosures the assessment carries. */
  limitationCount: number;
}

const VERDICTS: readonly EvidenceQualityVerdict[] = [
  'reportable-complete',
  'reportable-with-known-limitations',
  'needs-operator-review',
  'failed',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The minimal shape the summary reads off a persisted quality assessment.
 *  The pipeline writes it, but a damaged or future-versioned file must
 *  degrade to "no summary" rather than render a wrong verdict. */
function parseQualityAssessment(raw: unknown):
  | {
      digest: unknown;
      verdict: EvidenceQualityVerdict;
      issues: { code: string; severity: string; evidenceRefs: string[] }[];
      limitationCount: number;
    }
  | undefined {
  if (!isRecord(raw)) return undefined;
  const { digest, verdict, issues, mandatoryDisclosures } = raw;
  if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as EvidenceQualityVerdict)) {
    return undefined;
  }
  if (!Array.isArray(issues) || !Array.isArray(mandatoryDisclosures)) return undefined;
  const parsedIssues = issues.flatMap((issue) => {
    if (
      !isRecord(issue) ||
      typeof issue['code'] !== 'string' ||
      typeof issue['severity'] !== 'string' ||
      !Array.isArray(issue['evidenceRefs'])
    ) {
      return [];
    }
    return [
      {
        code: issue['code'],
        severity: issue['severity'],
        evidenceRefs: issue['evidenceRefs'].filter((ref): ref is string => typeof ref === 'string'),
      },
    ];
  });
  return {
    digest,
    verdict: verdict as EvidenceQualityVerdict,
    issues: parsedIssues,
    limitationCount: mandatoryDisclosures.length,
  };
}

/**
 * Pure over the three parsed evidence roots, so the summary for one set of
 * files is the same whenever it is recomputed and tests need no filesystem.
 * `confirmedFindingsDigest` is the digest of the findings being reported next
 * to this summary (the exact `confirmedFindingsDigest(findings)` value the
 * Plan 058 loader compares); passing it makes `approved` additionally require
 * that the approval's audit root still binds these findings, which is the view
 * the audit detail page shows. Callers that pin a rendered bundle instead of
 * re-reporting findings (the promotion gate) omit it — the bundle's content is
 * already fixed and digest-bound, so only the roots re-checked here can have
 * moved.
 */
export function summarizeAuditEvidenceQuality(input: {
  quality: unknown;
  auditRoot: unknown;
  approval: unknown;
  confirmedFindingsDigest?: string;
}): AuditEvidenceQualitySummary | undefined {
  const quality = parseQualityAssessment(input.quality);
  if (quality === undefined) return undefined;

  const blockingCodes = [
    ...new Set(
      quality.issues.filter((issue) => issue.severity === 'blocking').map((issue) => issue.code),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const blockingCounts: Record<string, number> = {};
  for (const issue of quality.issues) {
    if (issue.severity !== 'blocking') continue;
    blockingCounts[issue.code] = (blockingCounts[issue.code] ?? 0) + issue.evidenceRefs.length;
  }

  let approval: AuditEvidenceApprovalState = 'missing';
  let approvalDigest: string | undefined;
  const rawApproval = input.approval;
  const rawRoot = input.auditRoot;
  if (isRecord(rawApproval) && isRecord(rawRoot)) {
    // The same comparisons the Plan 058 loader runs: the approval names the
    // audit root and quality assessment beside it, and the audit root still
    // binds the findings being reported. A mismatch means the approval
    // approves something else — stale, never silently valid.
    const rootMatches =
      rawRoot['digest'] === rawApproval['auditEvidenceSnapshotDigest'] &&
      rawRoot['auditId'] === rawApproval['auditId'] &&
      quality.digest === rawApproval['evidenceQualityAssessmentDigest'];
    const findingsMatch =
      input.confirmedFindingsDigest === undefined ||
      rawRoot['confirmedFindingsDigest'] === input.confirmedFindingsDigest;
    if (rootMatches && findingsMatch) {
      approval = 'approved';
      approvalDigest = reportQualityDigest(rawApproval);
    } else {
      approval = 'stale';
    }
  }

  return {
    verdict: quality.verdict,
    approval,
    ...(approvalDigest !== undefined ? { approvalDigest } : {}),
    blockingCodes,
    blockingCounts,
    limitationCount: quality.limitationCount,
  };
}

/**
 * Reads the persisted evidence roots for one audit and summarizes them.
 * Returns `undefined` when no quality assessment exists (no Plan 059 graph —
 * the roots are written after it) or when the file cannot be parsed. This is
 * a display summary only: it never creates, removes, or stands in for an
 * approval, and every enforcement path (the Plan 058 loader, the promotion
 * gate) re-reads and fails closed on its own.
 */
export async function readAuditEvidenceQualitySummary(input: {
  auditDir: string;
  hostname: string;
  startedAt: Date;
  store: ArtifactStore | undefined;
  confirmedFindingsDigest?: string;
}): Promise<AuditEvidenceQualitySummary | undefined> {
  const readRoot = async (relativePath: string): Promise<unknown> => {
    try {
      const bytes = await resolveArtifactFile(
        `${input.auditDir}/${relativePath}`,
        buildArtifactBucketKey(input.hostname, input.startedAt, relativePath),
        input.store,
      );
      return JSON.parse(bytes.toString('utf-8')) as unknown;
    } catch {
      // Missing or unreadable stays "no data" for display purposes; the
      // enforcement paths surface the real error on their own terms.
      return undefined;
    }
  };
  // The quality assessment is the last root writeAuditEvidenceGraph writes:
  // if it is absent, no graph exists and the other two files cannot either,
  // so non-058 audits pay a single miss here.
  const quality = await readRoot(EVIDENCE_QUALITY_ASSESSMENT_PATH);
  if (quality === undefined) return undefined;
  const [auditRoot, approval] = await Promise.all([
    readRoot(AUDIT_EVIDENCE_SNAPSHOT_PATH),
    readRoot(APPROVED_AUDIT_EVIDENCE_PATH),
  ]);
  return summarizeAuditEvidenceQuality({
    quality,
    auditRoot,
    approval,
    ...(input.confirmedFindingsDigest !== undefined
      ? { confirmedFindingsDigest: input.confirmedFindingsDigest }
      : {}),
  });
}
