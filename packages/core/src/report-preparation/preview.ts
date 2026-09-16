import type { ReportLanguage } from '../types/llm-output.js';
import type { Finding } from '../types/findings.js';
import { resolveHookFamily } from './hook-family.js';
import type { ReportPreparation } from './preparation.js';
import { HOOK_FAMILY_COPY, resolveGenericDecisionQuestion, type HookFamily } from './vocabulary.js';
import {
  computeMissingContextWarnings,
  buildWarningDigest,
  type MissingContextField,
  type WarningDigestInput,
} from './warning-digest.js';

/**
 * The preparation preview, plan 019 step 4: a bounded, render-ready view of
 * what personalization will do, per language, saying which values are
 * custom, automatic, or generic fallbacks and why. It contains final
 * strings and typed states only, never prompts and never persistence
 * documents. Rendering escapes these values; nothing here is HTML.
 */

export type PreviewValueSource = 'custom' | 'automatic' | 'fallback';

export interface PreviewQuestion {
  value: string;
  source: PreviewValueSource;
}

export interface PreviewHook {
  family: HookFamily;
  value: string;
  /** True when no findings evidence was available, so `mixed` copy is used
   *  as a fallback rather than as a measured conclusion. */
  evidenceUnavailable: boolean;
}

export interface PreparationPreviewLanguage {
  language: ReportLanguage;
  coverQuestion: PreviewQuestion;
  hook: PreviewHook;
}

export interface ReportPreparationPreview {
  fr: PreparationPreviewLanguage;
  en: PreparationPreviewLanguage;
  /** Warning-relevant inputs currently missing; generation warns on these. */
  warnings: readonly MissingContextField[];
  warningDigest: string;
}

export interface BuildPreviewInput {
  preparation: ReportPreparation;
  /** The confirmed commercial name, when manual fields carry one. */
  commercialName?: string | undefined;
  /** On-disk findings; absent means the hook has no evidence. */
  findings?: readonly Finding[] | undefined;
}

function resolveQuestion(pick: ReportLanguage, preparation: ReportPreparation): PreviewQuestion {
  const custom = preparation.customCoverQuestion?.[pick];
  if (custom) return { value: custom, source: 'custom' };
  return { value: resolveGenericDecisionQuestion(pick), source: 'fallback' };
}

export function buildReportPreparationPreview(input: BuildPreviewInput): ReportPreparationPreview {
  const { preparation, findings } = input;
  const hookResolution = findings ? resolveHookFamily(findings) : null;
  const family: HookFamily = hookResolution?.family ?? 'mixed';

  const digestInput: WarningDigestInput = {
    commercialName: input.commercialName,
    customCoverQuestion: preparation.customCoverQuestion,
  };

  const buildLanguage = (pick: ReportLanguage): PreparationPreviewLanguage => ({
    language: pick,
    coverQuestion: resolveQuestion(pick, preparation),
    hook: {
      family,
      value: HOOK_FAMILY_COPY[family][pick],
      evidenceUnavailable: findings === undefined,
    },
  });

  return {
    fr: buildLanguage('fr'),
    en: buildLanguage('en'),
    warnings: computeMissingContextWarnings(digestInput),
    warningDigest: buildWarningDigest(digestInput),
  };
}
