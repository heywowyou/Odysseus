import { createHash } from 'node:crypto';
import type { LocalizedOptionalText } from './preparation.js';
import type { JourneyId, ReportSituation, ReportTrigger } from './vocabulary.js';

/**
 * The warning digest, plan 019 step 5. It covers exactly the
 * warning-relevant inputs: commercial name, situation, trigger, localized
 * `other` notes, custom questions, and the resolved journey scope. Optional
 * stakeholder names deliberately do not enter the digest, so filling them
 * never invalidates a confirmation.
 *
 * Canonicalization mirrors the findings-provenance hash (sorted keys,
 * arrays in order, no undefined) so the same inputs always produce the
 * same digest across processes.
 */

export const MISSING_CONTEXT_FIELDS = [
  'commercial-name',
  'situation',
  'trigger',
  'journey-scope',
] as const;

export type MissingContextField = (typeof MISSING_CONTEXT_FIELDS)[number];

export interface WarningDigestInput {
  commercialName?: string | undefined;
  situation?: ReportSituation | undefined;
  trigger?: ReportTrigger | undefined;
  triggerOther?: LocalizedOptionalText | undefined;
  customCoverQuestion?: LocalizedOptionalText | undefined;
  /** Resolved confirmed journey scope, sorted by the caller or sorted here. */
  confirmedJourneyIds: readonly JourneyId[];
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function buildWarningDigest(input: WarningDigestInput): string {
  const payload = {
    commercialName: input.commercialName ?? null,
    situation: input.situation ?? null,
    trigger: input.trigger ?? null,
    triggerOther: input.triggerOther ?? null,
    customCoverQuestion: input.customCoverQuestion ?? null,
    confirmedJourneyIds: [...input.confirmedJourneyIds].sort(),
  };
  const canonical = JSON.stringify(canonicalize(payload));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function computeMissingContextWarnings(input: WarningDigestInput): MissingContextField[] {
  const warnings: MissingContextField[] = [];
  if (!input.commercialName) warnings.push('commercial-name');
  // 'unknown' is a deliberate operator choice, not a missing one: it changes
  // the copy (generic fallback) but does not re-raise the warning.
  if (!input.situation) warnings.push('situation');
  if (!input.trigger) warnings.push('trigger');
  if (input.confirmedJourneyIds.length === 0) warnings.push('journey-scope');
  return warnings;
}

/**
 * True when the stored acknowledgement matches the digest of the current
 * inputs. An acknowledgement for different inputs is never honoured.
 */
export function isAcknowledgementCurrent(
  acknowledgement: { digest: string } | undefined,
  currentDigest: string,
): boolean {
  return acknowledgement !== undefined && acknowledgement.digest === currentDigest;
}
