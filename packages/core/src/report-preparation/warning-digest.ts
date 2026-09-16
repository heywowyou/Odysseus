import { createHash } from 'node:crypto';
import type { LocalizedOptionalText } from './preparation.js';

/**
 * The warning digest, plan 019 step 5. It covers exactly the
 * warning-relevant inputs: commercial name and custom questions.
 *
 * Canonicalization mirrors the findings-provenance hash (sorted keys,
 * arrays in order, no undefined) so the same inputs always produce the
 * same digest across processes.
 */

export const MISSING_CONTEXT_FIELDS = ['commercial-name'] as const;

export type MissingContextField = (typeof MISSING_CONTEXT_FIELDS)[number];

export interface WarningDigestInput {
  commercialName?: string | undefined;
  customCoverQuestion?: LocalizedOptionalText | undefined;
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
    customCoverQuestion: input.customCoverQuestion ?? null,
  };
  const canonical = JSON.stringify(canonicalize(payload));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function computeMissingContextWarnings(input: WarningDigestInput): MissingContextField[] {
  const warnings: MissingContextField[] = [];
  if (!input.commercialName) warnings.push('commercial-name');
  return warnings;
}
