import { canonicalDigest, type EvidenceLimitation } from '@odysseus/core';
import {
  AUDIT_EVIDENCE_SNAPSHOT_PATH,
  buildArtifactBucketKey,
  EVIDENCE_QUALITY_ASSESSMENT_PATH,
  type EvidenceQualityReasonCode,
} from '@odysseus/scanner';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';

export type AuditEvidenceDiagnosticStatus = 'complete' | 'limited' | 'unavailable';

export interface AuditEvidenceDiagnostics {
  status: AuditEvidenceDiagnosticStatus;
  clientLimitations: EvidenceLimitation[];
  operationalWarnings: { code: string; referenceCount: number }[];
}

type ReasonClass = 'client' | 'operational' | 'unavailable';
interface ReasonRule {
  kind: ReasonClass;
  fr: string;
  en: string;
}

/**
 * Plan 068's one exhaustive classification of every reason the Plan-059
 * evidence graph can currently emit. Client limitations narrow the claims
 * made by the report. Operational warnings describe the scan environment
 * without invalidating otherwise-usable findings. Root/consistency failures
 * make this diagnostic layer itself unreliable, so they project to
 * `unavailable` rather than to a report veto.
 */
export const EVIDENCE_REASON_CLASSIFICATION: Record<EvidenceQualityReasonCode, ReasonRule> = {
  'raw-evidence-invalid': {
    kind: 'unavailable',
    fr: 'Le diagnostic détaillé des preuves est incohérent et ne peut pas être interprété de façon fiable.',
    en: 'The detailed evidence diagnostic is inconsistent and cannot be interpreted reliably.',
  },
  'inventory-unreconciled': {
    kind: 'client',
    fr: 'Certaines pages connues du site n’ont pas reçu de statut final dans l’inventaire du scan. Les conclusions restent limitées aux pages et contrôles effectivement observés.',
    en: 'Some known site pages did not receive a final inventory status. Conclusions remain limited to the pages and checks actually observed.',
  },
  'unresolved-material-gap': {
    kind: 'client',
    fr: 'Certaines vérifications importantes n’ont pas obtenu de preuve exploitable après les tentatives de récupération. Le rapport ne présente pas ces vérifications comme confirmées.',
    en: 'Some material checks did not obtain usable evidence after recovery attempts. The report does not present those checks as confirmed.',
  },
  'unstable-material-result': {
    kind: 'client',
    fr: 'Certaines vérifications ont produit des résultats instables ou contradictoires. Le rapport les traite comme une limite de mesure plutôt que comme un constat certain.',
    en: 'Some checks produced unstable or conflicting results. The report treats them as a measurement limitation rather than a certain finding.',
  },
  'temporal-drift': {
    kind: 'client',
    fr: 'Le site a changé pendant le scan. Certaines observations peuvent donc provenir de versions légèrement différentes du site.',
    en: 'The site changed during the scan. Some observations may therefore come from slightly different versions of the site.',
  },
  'temporal-coherence-unverified': {
    kind: 'client',
    fr: 'Le scan ne peut pas démontrer que toutes les observations proviennent exactement de la même version du site.',
    en: 'The scan cannot demonstrate that every observation comes from exactly the same version of the site.',
  },
  'disclosed-scope-limitation': {
    kind: 'client',
    fr: 'Une partie du périmètre n’a pas pu être inspectée dans les mêmes conditions que le reste du site ; cette limite est explicitée dans le rapport.',
    en: 'Part of the scope could not be inspected under the same conditions as the rest of the site; this limitation is disclosed in the report.',
  },
  'performance-confidence-insufficient': {
    kind: 'client',
    fr: 'Certaines mesures de performance ne disposent pas d’un niveau de stabilité suffisant. Elles ne sont pas utilisées comme base certaine pour prioriser une correction.',
    en: 'Some performance measurements do not have sufficient stability. They are not used as a certain basis for prioritising a correction.',
  },
  'capability-gap-undisclosed': {
    kind: 'client',
    fr: 'Un contenu important n’a pas pu être inspecté par les capacités disponibles du scan. Les conclusions n’extrapolent pas à ce contenu.',
    en: 'Material content could not be inspected by the scan capabilities available. Conclusions are not extrapolated to that content.',
  },
  'site-level-unknown': {
    kind: 'client',
    fr: 'Au moins une vérification au niveau du site n’a pas obtenu de preuve exploitable. Le rapport ne présente pas ce point comme vérifié.',
    en: 'At least one site-level check did not obtain usable evidence. The report does not present that point as verified.',
  },
  'robots-policy-unresolved': {
    kind: 'client',
    fr: 'La politique robots du site n’a pas pu être établie de manière fiable pour ce scan. Les conclusions restent limitées au contenu effectivement observé.',
    en: 'The site robots policy could not be established reliably for this scan. Conclusions remain limited to content actually observed.',
  },
  'network-safety-preflight-failed': {
    kind: 'operational',
    fr: 'Le contrôle préalable de sécurité réseau du scanner a signalé un problème d’environnement.',
    en: 'The scanner network-safety preflight reported an environment problem.',
  },
  'environment-unapproved': {
    kind: 'operational',
    fr: 'L’environnement d’exécution du navigateur ne correspond pas au profil d’isolation attendu.',
    en: 'The browser execution environment does not match the expected isolation profile.',
  },
  'consistency-gate-failed': {
    kind: 'unavailable',
    fr: 'Les racines du diagnostic détaillé ne sont pas cohérentes entre elles.',
    en: 'The detailed diagnostic roots are not mutually consistent.',
  },
  'operator-resolution-required': {
    kind: 'client',
    fr: 'Le site a limité certaines acquisitions du scanner. Les conclusions restent limitées aux vérifications qui ont obtenu une preuve exploitable.',
    en: 'The site limited some scanner acquisitions. Conclusions remain limited to checks that obtained usable evidence.',
  },
  'legacy-evidence-insufficient': {
    kind: 'client',
    fr: 'Cet audit ancien ne contient pas toutes les données de diagnostic disponibles dans les scans actuels. Le rapport reste limité aux preuves effectivement enregistrées.',
    en: 'This older audit does not contain all diagnostic data available in current scans. The report remains limited to evidence actually recorded.',
  },
};

const KNOWN_REASON_CODES = new Set<EvidenceQualityReasonCode>(
  Object.keys(EVIDENCE_REASON_CLASSIFICATION) as EvidenceQualityReasonCode[],
);
const REPORT_DESTINATION = 'section-11';

interface ParsedIssue {
  code: EvidenceQualityReasonCode;
  evidenceRefs: string[];
  disclosure?: EvidenceLimitation;
}

interface ParsedQuality {
  auditId: string;
  evidenceEpoch: number;
  auditEvidenceSnapshotDigest: string;
  issues: ParsedIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasValidCanonicalDigest(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value['digest'] !== 'string') return false;
  const { digest, ...body } = value;
  return canonicalDigest(body) === digest;
}

function parseDisclosure(value: unknown): EvidenceLimitation | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value['limitationId'] !== 'string' ||
    typeof value['code'] !== 'string' ||
    typeof value['reportDestination'] !== 'string' ||
    !isRecord(value['summary']) ||
    typeof value['summary']['fr'] !== 'string' ||
    typeof value['summary']['en'] !== 'string' ||
    !Array.isArray(value['evidenceRefs'])
  ) {
    return undefined;
  }
  return {
    limitationId: value['limitationId'],
    code: value['code'],
    summary: { fr: value['summary']['fr'], en: value['summary']['en'] },
    reportDestination: value['reportDestination'],
    evidenceRefs: value['evidenceRefs'].filter((ref): ref is string => typeof ref === 'string'),
  };
}

function parseQuality(raw: unknown): ParsedQuality | undefined {
  if (!isRecord(raw)) return undefined;
  if (
    typeof raw['auditId'] !== 'string' ||
    typeof raw['evidenceEpoch'] !== 'number' ||
    typeof raw['auditEvidenceSnapshotDigest'] !== 'string' ||
    !Array.isArray(raw['issues'])
  ) {
    return undefined;
  }
  const issues: ParsedIssue[] = [];
  for (const rawIssue of raw['issues']) {
    if (
      !isRecord(rawIssue) ||
      typeof rawIssue['code'] !== 'string' ||
      !KNOWN_REASON_CODES.has(rawIssue['code'] as EvidenceQualityReasonCode) ||
      !Array.isArray(rawIssue['evidenceRefs'])
    ) {
      return undefined;
    }
    const disclosure = parseDisclosure(rawIssue['disclosure']);
    issues.push({
      code: rawIssue['code'] as EvidenceQualityReasonCode,
      evidenceRefs: rawIssue['evidenceRefs'].filter(
        (ref): ref is string => typeof ref === 'string',
      ),
      ...(disclosure !== undefined ? { disclosure } : {}),
    });
  }
  return {
    auditId: raw['auditId'],
    evidenceEpoch: raw['evidenceEpoch'],
    auditEvidenceSnapshotDigest: raw['auditEvidenceSnapshotDigest'],
    issues,
  };
}

function compatibilityLimitation(issue: ParsedIssue): EvidenceLimitation {
  const copy = EVIDENCE_REASON_CLASSIFICATION[issue.code];
  return {
    limitationId: `limitation:evidence-diagnostic:${issue.code}`,
    code: issue.code,
    summary: { fr: copy.fr, en: copy.en },
    reportDestination: REPORT_DESTINATION,
    evidenceRefs: [...new Set(issue.evidenceRefs)].sort(),
  };
}

function mergeLimitation(
  target: Map<string, EvidenceLimitation>,
  limitation: EvidenceLimitation,
): void {
  const existing = target.get(limitation.limitationId);
  if (existing === undefined) {
    target.set(limitation.limitationId, {
      ...limitation,
      evidenceRefs: [...new Set(limitation.evidenceRefs)].sort(),
    });
    return;
  }
  existing.evidenceRefs = [
    ...new Set([...existing.evidenceRefs, ...limitation.evidenceRefs]),
  ].sort();
}

export function summarizeAuditEvidenceDiagnostics(input: {
  quality: unknown;
  auditRoot: unknown;
}): AuditEvidenceDiagnostics {
  if (!hasValidCanonicalDigest(input.quality) || !hasValidCanonicalDigest(input.auditRoot)) {
    return { status: 'unavailable', clientLimitations: [], operationalWarnings: [] };
  }
  const quality = parseQuality(input.quality);
  if (!quality) {
    return { status: 'unavailable', clientLimitations: [], operationalWarnings: [] };
  }
  if (
    input.auditRoot['digest'] !== quality.auditEvidenceSnapshotDigest ||
    input.auditRoot['auditId'] !== quality.auditId ||
    input.auditRoot['evidenceEpoch'] !== quality.evidenceEpoch
  ) {
    return { status: 'unavailable', clientLimitations: [], operationalWarnings: [] };
  }
  if (
    quality.issues.some(
      (issue) => EVIDENCE_REASON_CLASSIFICATION[issue.code].kind === 'unavailable',
    )
  ) {
    return { status: 'unavailable', clientLimitations: [], operationalWarnings: [] };
  }

  const limitations = new Map<string, EvidenceLimitation>();
  const warnings = new Map<string, number>();
  for (const issue of quality.issues) {
    const classification = EVIDENCE_REASON_CLASSIFICATION[issue.code];
    if (classification.kind === 'operational') {
      warnings.set(issue.code, (warnings.get(issue.code) ?? 0) + issue.evidenceRefs.length);
      continue;
    }
    if (classification.kind !== 'client') continue;
    mergeLimitation(limitations, issue.disclosure ?? compatibilityLimitation(issue));
  }

  const clientLimitations = [...limitations.values()].sort((a, b) =>
    a.limitationId.localeCompare(b.limitationId),
  );
  const operationalWarnings = [...warnings.entries()]
    .map(([code, referenceCount]) => ({ code, referenceCount }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    status: clientLimitations.length > 0 ? 'limited' : 'complete',
    clientLimitations,
    operationalWarnings,
  };
}

const diagnosticCache = new Map<string, Promise<AuditEvidenceDiagnostics>>();

export async function readAuditEvidenceDiagnostics(input: {
  auditDir: string;
  hostname: string;
  startedAt: Date;
  store: ArtifactStore | undefined;
}): Promise<AuditEvidenceDiagnostics> {
  const cacheKey = `${input.auditDir}|${input.hostname}|${input.startedAt.toISOString()}`;
  const existing = diagnosticCache.get(cacheKey);
  if (existing !== undefined) return existing;

  const pending = (async (): Promise<AuditEvidenceDiagnostics> => {
    const readRoot = async (relativePath: string): Promise<unknown> => {
      try {
        const bytes = await resolveArtifactFile(
          `${input.auditDir}/${relativePath}`,
          buildArtifactBucketKey(input.hostname, input.startedAt, relativePath),
          input.store,
        );
        return JSON.parse(bytes.toString('utf-8')) as unknown;
      } catch {
        return undefined;
      }
    };
    const quality = await readRoot(EVIDENCE_QUALITY_ASSESSMENT_PATH);
    if (quality === undefined) {
      return { status: 'unavailable', clientLimitations: [], operationalWarnings: [] };
    }
    const auditRoot = await readRoot(AUDIT_EVIDENCE_SNAPSHOT_PATH);
    return summarizeAuditEvidenceDiagnostics({ quality, auditRoot });
  })();

  diagnosticCache.set(cacheKey, pending);
  return pending;
}
