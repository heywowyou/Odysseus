import {
  FINDINGS_SCHEMA_VERSION,
  type ApprovedAuditEvidence,
  type ApprovedAuditEvidencePayload,
  type AuditManifest,
  type Finding,
  type ReportQualityRole,
  type Sha256Digest,
} from '@odysseus/core';
import type {
  EditorOutput,
  QualityReviewOutput,
  QualityWriterOutput,
  SeniorPlanOutput,
} from '@odysseus/llm';
import type { ArtifactStore } from '../artifacts/artifact-store.js';

/**
 * Pure data builders for report-quality-pipeline.test.ts. No mocks live
 * here: everything in this file is plain fixture data so the vi.mock
 * factories in the test file only need the `vi.hoisted` harness.
 *
 * The writer/prose strings are validated against the pipeline's
 * deterministic guards every fixture must survive:
 * - `assertNoFreehandExactScalar` rejects digits and URLs inside text
 *   segments (exact scalars must go through fact bindings),
 * - `deterministicProseViolations` rejects unsupported-certainty wording,
 * so every string below is deliberately digit-free and hedged.
 */

const AUDIT_ID = 'audit-058-pipeline-test';
const SITE_URL = 'https://hotel-exemple.fr/';
export const PROJECT_KEY = 'priorites';

export const SAFE_PROSE: Record<'fr' | 'en', string> = {
  fr: 'Des obstacles sérieux demandent des corrections rapides sur ce site.',
  en: 'Several serious obstacles require prompt corrections on this site.',
};

const SAFE_PATCH_TEXT: Record<'fr' | 'en', string> = {
  fr: 'Un titre corrigé et aligné sur le registre de faits.',
  en: 'A corrected heading aligned with the fact registry.',
};

export const DISCLOSURE = {
  limitationId: 'limitation:robots-disallowed-pages',
  code: 'robots-disallowed-pages',
  summary: {
    fr: 'Une page est exclue parce que le fichier robots interdit son exploration.',
    en: 'One page is excluded because the robots file forbids its crawl.',
  },
  reportDestination: 'section-11',
  evidenceRefs: [],
};

export function findingFixture(findingId: string, overrides: Partial<Finding> = {}): Finding {
  return {
    findingId,
    auditId: AUDIT_ID,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: '',
    description: '',
    pageUrls: [SITE_URL],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: findingId,
    firstSeenAt: new Date(0),
    lastSeenAt: new Date(0),
    ...overrides,
  };
}

export const DEFAULT_FINDINGS: Finding[] = [findingFixture('finding-contrastes')];

export function manifestFixture(): AuditManifest {
  // The pipeline reads auditId/siteUrl/startedAt plus crawl.visitedCount and
  // the page list (fact registry); the rest of the shape is irrelevant.
  return {
    auditId: AUDIT_ID,
    siteUrl: SITE_URL,
    startedAt: '2026-09-18T08:00:00.000Z',
    crawl: { visitedCount: 4 },
    pages: [],
  } as unknown as AuditManifest;
}

function approvalFixture(overrides: Partial<ApprovedAuditEvidence> = {}): ApprovedAuditEvidence {
  return {
    auditId: AUDIT_ID,
    evidenceEpoch: 1,
    rawEvidenceSnapshotDigest: `sha256:${'c'.repeat(64)}` as Sha256Digest,
    auditEvidenceSnapshotDigest: `sha256:${'a'.repeat(64)}` as Sha256Digest,
    evidenceQualityAssessmentDigest: `sha256:${'b'.repeat(64)}` as Sha256Digest,
    verdict: 'reportable-with-known-limitations',
    limitations: [DISCLOSURE],
    evidenceCoverageSignature: {} as ApprovedAuditEvidence['evidenceCoverageSignature'],
    capabilityRegistryVersion: 'test',
    approvalMode: 'system',
    approvedAt: '2026-09-18T09:31:00.000Z',
    approvedBySystemVersion: 'test-build:evidence-approval-policy-v1',
    ...overrides,
  };
}

export function evidenceFixture(
  findings: Finding[] = DEFAULT_FINDINGS,
  approvalOverrides: Partial<ApprovedAuditEvidence> = {},
): ApprovedAuditEvidencePayload {
  const approval = approvalFixture(approvalOverrides);
  return {
    approval,
    manifest: manifestFixture(),
    findings,
    mandatoryDisclosures: [...approval.limitations],
  };
}

/** Raw senior-analyst output (pre-normalization, seniorPlanOutputSchema shape)
 *  covering every supplied finding with exactly one remediation project. */
export function seniorPlanOutputFor(findings: Finding[]): SeniorPlanOutput {
  return {
    remediationProjects: [
      {
        projectKey: PROJECT_KEY,
        category: 'accessibility',
        findingIds: findings.map((finding) => finding.findingId),
        evidenceRefs: [],
        factRefs: [],
        impact: 'high',
        effort: 'medium',
        rationale: 'Un même chantier de correction couvre les constats fournis.',
        dependencies: [],
        sharedDependencies: [],
      },
    ],
    executivePriorityKeys: [PROJECT_KEY],
  };
}

/** Raw writer output whose project keys match seniorPlanOutputFor above and
 *  whose only fact binding is a registry fact (audit.findingCount). */
export function writerOutputFor(language: 'fr' | 'en'): QualityWriterOutput {
  const text = () => ({ segments: [{ kind: 'text' as const, text: SAFE_PROSE[language] }] });
  return {
    executiveSummary: text(),
    notes: {
      segments: [
        { kind: 'text' as const, text: SAFE_PROSE[language] },
        { kind: 'fact' as const, factId: 'audit.findingCount' },
      ],
    },
    projects: [
      {
        projectKey: PROJECT_KEY,
        title: text(),
        businessImpact: text(),
        recommendedActions: [text()],
      },
    ],
  };
}

/** Raw reviewer issue (issueProposalSchema shape). The pipeline prefixes
 *  issueId with the source role before adjudication. */
export function criticIssue(
  overrides: Partial<QualityReviewOutput['issues'][number]> = {},
): QualityReviewOutput['issues'][number] {
  return {
    issueId: 'c1',
    kind: 'objective-defect',
    severity: 'major',
    target: `projects.${PROJECT_KEY}.title`,
    domain: 'editorial',
    supportingRefs: [],
    reason: 'Le titre contredit le registre de faits.',
    repairRoute: 'patch-prose',
    status: 'proposed',
    ...overrides,
  };
}

export type AdjudicationStatus = 'accepted' | 'rejected' | 'unsure';

export interface LlmCallInput {
  role: ReportQualityRole;
  userPayload: unknown;
  jsonSchema: Record<string, unknown>;
  imagePaths?: readonly string[];
}

export type LlmScriptHandler = (
  input: LlmCallInput,
  callNumber: number,
) => unknown | Promise<unknown>;

export interface LlmScriptOptions {
  /** Findings the default senior-analyst plan covers. */
  findings: Finding[];
  /** Overrides of the default scripted raw output per role. */
  roles?: Partial<Record<ReportQualityRole, (ctx: LlmCallInput, callNumber: number) => unknown>>;
  /** Raw issues per reviewer role; a function form receives the per-role
   *  call number so tests can vary answers across iterations. */
  issues?: Partial<
    Record<
      | 'content-critic-evidence'
      | 'content-critic-editorial'
      | 'parity-reviewer'
      | 'visual-reviewer-physical'
      | 'visual-reviewer-design'
      | 'final-visual-reviewer',
      QualityReviewOutput['issues'] | ((callNumber: number) => QualityReviewOutput['issues'])
    >
  >;
  /** Adjudication policy for supplied issues. Defaults to accepting
   *  objective defects and rejecting preferences. */
  adjudicate?: (issue: { issueId: string; kind: string }) => AdjudicationStatus;
  /** Raw final-document-arbiter verdict. Defaults to approval. */
  arbiter?: { approved: boolean; issues: QualityReviewOutput['issues'] };
  /** Raw writer outputs per language. Defaults to writerOutputFor. */
  writers?: Partial<Record<'fr' | 'en', QualityWriterOutput>>;
  /** Raw editor patches. Defaults to patching each accepted target. */
  editor?: EditorOutput | ((ctx: LlmCallInput) => EditorOutput);
}

const REVIEWER_ROLES = [
  'content-critic-evidence',
  'content-critic-editorial',
  'parity-reviewer',
  'visual-reviewer-physical',
  'visual-reviewer-design',
  'final-visual-reviewer',
] as const;

/**
 * Builds a scripted callReportQualityRole handler. Every returned raw output
 * is parsed by the real zod parser inside the mock, so fixtures that drift
 * from the LLM output schemas fail loudly instead of silently passing.
 */
export function makeLlmScript(options: LlmScriptOptions): LlmScriptHandler {
  const plan = options.roles?.['senior-analyst']
    ? undefined
    : seniorPlanOutputFor(options.findings);
  const adjudicate =
    options.adjudicate ??
    ((issue: { kind: string }) => (issue.kind === 'objective-defect' ? 'accepted' : 'rejected'));
  return function scriptedLlm(input, callNumber) {
    const scripted = options.roles?.[input.role];
    if (scripted) return scripted(input, callNumber);
    switch (input.role) {
      case 'senior-analyst':
        return plan;
      case 'writer-fr':
        return options.writers?.fr ?? writerOutputFor('fr');
      case 'writer-en':
        return options.writers?.en ?? writerOutputFor('en');
      case 'final-document-arbiter':
        return options.arbiter ?? { approved: true, issues: [] };
      case 'issue-adjudicator': {
        const payload = input.userPayload as { issues: Array<{ issueId: string; kind: string }> };
        return {
          decisions: payload.issues.map((issue) => ({
            issueId: issue.issueId,
            status: adjudicate(issue),
            reason: 'Adjudicated against the supplied evidence.',
          })),
        };
      }
      case 'editor': {
        if (typeof options.editor === 'function') return options.editor(input);
        if (options.editor) return options.editor;
        const payload = input.userPayload as {
          language: 'fr' | 'en';
          acceptedIssues: Array<{ issueId: string; target: string }>;
        };
        return {
          patches: payload.acceptedIssues.map((issue) => ({
            issueId: issue.issueId,
            target: issue.target,
            replacement: {
              segments: [{ kind: 'text' as const, text: SAFE_PATCH_TEXT[payload.language] }],
            },
          })),
        };
      }
      default: {
        if ((REVIEWER_ROLES as readonly string[]).includes(input.role)) {
          const scriptedIssues = options.issues?.[input.role as (typeof REVIEWER_ROLES)[number]];
          const issues =
            typeof scriptedIssues === 'function' ? scriptedIssues(callNumber) : scriptedIssues;
          return { issues: issues ?? [] };
        }
        throw new Error(`fixture bug: no scripted output for role ${input.role}`);
      }
    }
  };
}

/** The default all-roles-approve script used by most tests. */
export function approveAllScript(
  findings: Finding[],
  overrides: Partial<LlmScriptOptions> = {},
): LlmScriptHandler {
  return makeLlmScript({ findings, ...overrides });
}

/**
 * In-memory ArtifactStore double: content-addressed reads/writes like the
 * real port, with no disk or network. Readback verification in
 * report-quality-storage.ts exercises this store for real.
 */
export class InMemoryArtifactStore implements ArtifactStore {
  private readonly objects = new Map<string, Buffer>();

  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    this.objects.set(key, bytes);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
