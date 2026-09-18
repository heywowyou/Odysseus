import { createHash } from 'node:crypto';
import type { ReportQualityReasoningEffort, ReportQualityRole, Sha256Digest } from '@odysseus/core';

export interface ReportModelProfile {
  /** The role this profile is approved for. Plan 058 §6.1: the registry is
   *  keyed exhaustively by ReportQualityRole and carries no wildcard or
   *  default entry, so the recorded role and the lookup key can never
   *  disagree. */
  role: ReportQualityRole;
  profileId: string;
  profileContractVersion: '058-v3';
  provider: 'openai';
  model: 'gpt-5.6-sol';
  reasoningEffort: ReportQualityReasoningEffort;
  modality: 'text' | 'vision';
  structuredOutputs: true;
  maxCompletionTokens: 32000;
  promptVersion: string;
  schemaVersion: string;
  /** The saved-corpus benchmark approval this production profile depends on.
   *  A profile whose approval is not current in
   *  REPORT_PROFILE_BENCHMARK_MANIFEST blocks production promotion. */
  benchmarkApprovalId: string;
}

const SOL = 'gpt-5.6-sol' as const;
const PROMPT_VERSION = '058-prompt-v1';
const SCHEMA_VERSION = '058-schema-v1';
const BENCHMARK_APPROVAL_ID = '058-saved-corpus-2026-09';

export const REPORT_MODEL_PROFILES = {
  'senior-analyst': {
    role: 'senior-analyst',
    profileId: '058-senior-analyst-sol-xhigh-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'writer-fr': {
    role: 'writer-fr',
    profileId: '058-writer-fr-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'writer-en': {
    role: 'writer-en',
    profileId: '058-writer-en-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'content-critic-evidence': {
    role: 'content-critic-evidence',
    profileId: '058-content-critic-evidence-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'content-critic-editorial': {
    role: 'content-critic-editorial',
    profileId: '058-content-critic-editorial-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'issue-adjudicator': {
    role: 'issue-adjudicator',
    profileId: '058-issue-adjudicator-sol-xhigh-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  editor: {
    role: 'editor',
    profileId: '058-editor-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'visual-reviewer-physical': {
    role: 'visual-reviewer-physical',
    profileId: '058-visual-physical-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'visual-reviewer-design': {
    role: 'visual-reviewer-design',
    profileId: '058-visual-design-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'visual-issue-adjudicator': {
    role: 'visual-issue-adjudicator',
    profileId: '058-visual-adjudicator-sol-xhigh-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'parity-reviewer': {
    role: 'parity-reviewer',
    profileId: '058-parity-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'final-visual-reviewer': {
    role: 'final-visual-reviewer',
    profileId: '058-final-visual-sol-high-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
  'final-document-arbiter': {
    role: 'final-document-arbiter',
    profileId: '058-final-arbiter-sol-xhigh-v1',
    profileContractVersion: '058-v3',
    provider: 'openai',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    benchmarkApprovalId: BENCHMARK_APPROVAL_ID,
  },
} satisfies Record<ReportQualityRole, ReportModelProfile>;

/** Thrown when a Plan 058 role has no approved profile. Plan 058 §6.1:
 *  missing/unapproved profile is a fail-closed configuration error — never a
 *  fallback to a legacy mini model or a generic environment-wide report
 *  model. */
export class ReportModelProfileMissingError extends Error {
  constructor(role: ReportQualityRole) {
    super(
      `no approved Plan 058 model profile exists for role "${role}"; ` +
        'the role cannot fall back to a legacy or generic model',
    );
    this.name = 'ReportModelProfileMissingError';
  }
}

function digest(value: unknown): Sha256Digest {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function getReportModelProfile(role: ReportQualityRole): ReportModelProfile {
  const profile = (REPORT_MODEL_PROFILES as Record<string, ReportModelProfile | undefined>)[role];
  if (!profile) throw new ReportModelProfileMissingError(role);
  return profile;
}

export function getReportModelProfileDigest(role: ReportQualityRole): Sha256Digest {
  return digest(getReportModelProfile(role));
}

export function getReportModelProfileMatrixDigest(): Sha256Digest {
  return digest(REPORT_MODEL_PROFILES);
}
