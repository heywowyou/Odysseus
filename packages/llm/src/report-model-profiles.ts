import { createHash } from 'node:crypto';
import type {
  ReportQualityReasoningEffort,
  ReportQualityRole,
  Sha256Digest,
} from '@odysseus/core';

export interface ReportModelProfile {
  profileId: string;
  profileContractVersion: '058-v2';
  model: 'gpt-5.6-sol';
  reasoningEffort: ReportQualityReasoningEffort;
  modality: 'text' | 'vision';
  structuredOutputs: true;
  maxCompletionTokens: 32000;
}

const SOL = 'gpt-5.6-sol' as const;

export const REPORT_MODEL_PROFILES = {
  'senior-analyst': {
    profileId: '058-senior-analyst-sol-xhigh-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'writer-fr': {
    profileId: '058-writer-fr-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'writer-en': {
    profileId: '058-writer-en-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'content-critic-evidence': {
    profileId: '058-content-critic-evidence-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'content-critic-editorial': {
    profileId: '058-content-critic-editorial-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'issue-adjudicator': {
    profileId: '058-issue-adjudicator-sol-xhigh-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  editor: {
    profileId: '058-editor-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'visual-reviewer-physical': {
    profileId: '058-visual-physical-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'visual-reviewer-design': {
    profileId: '058-visual-design-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'visual-issue-adjudicator': {
    profileId: '058-visual-adjudicator-sol-xhigh-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'parity-reviewer': {
    profileId: '058-parity-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'final-visual-reviewer': {
    profileId: '058-final-visual-sol-high-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'high',
    modality: 'vision',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
  'final-document-arbiter': {
    profileId: '058-final-arbiter-sol-xhigh-v1',
    profileContractVersion: '058-v2',
    model: SOL,
    reasoningEffort: 'xhigh',
    modality: 'text',
    structuredOutputs: true,
    maxCompletionTokens: 32000,
  },
} satisfies Record<ReportQualityRole, ReportModelProfile>;

function digest(value: unknown): Sha256Digest {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function getReportModelProfile(role: ReportQualityRole): ReportModelProfile {
  return REPORT_MODEL_PROFILES[role];
}

export function getReportModelProfileDigest(role: ReportQualityRole): Sha256Digest {
  return digest(getReportModelProfile(role));
}

export function getReportModelProfileMatrixDigest(): Sha256Digest {
  return digest(REPORT_MODEL_PROFILES);
}
