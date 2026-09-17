/**
 * Deterministic content addressing for the plan 059 evidence graph.
 *
 * Every artifact in that graph - the scope snapshot, the robots policy
 * snapshot, and later the raw and normalized evidence roots - has to hash to
 * the same digest whenever its content is the same, on any machine and in any
 * key order. One helper here means the graph cannot end up with two
 * definitions of "the same content" that disagree about a digest.
 *
 * Why this is not shared with `normalize/findings-provenance.ts`, which
 * canonicalizes identically: `scripts/fixture-fingerprint.mjs` hashes the
 * whole of `packages/core/src/normalize` into `NORMALIZATION_FINGERPRINT`, so
 * editing that file - even to delete a duplicated function and import this one
 * - marks every stored findings.json stale and demands a fixture refresh from
 * real scan artifacts. The duplication is roughly fifteen lines and both
 * copies are pinned by tests; the refactor costs a corpus rebuild. Fold the
 * two together the next time a normalization change bumps that fingerprint
 * anyway.
 */

import { createHash } from 'node:crypto';

/**
 * Rewrites a value into the one shape that JSON.stringify serializes
 * identically for equal content: object keys sorted, `undefined` members
 * dropped so an absent key and an explicitly-undefined one agree, and Dates
 * reduced to their ISO string rather than `{}`.
 *
 * Array order is preserved, never sorted. Order is content: a seed list the
 * operator gave in a different order is a different scope, and silently
 * sorting would hide that.
 */
export function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
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

/**
 * The digest of one evidence artifact, prefixed with its algorithm so a stored
 * value stays readable if the algorithm is ever versioned.
 */
export function canonicalDigest(value: unknown): string {
  const canonical = JSON.stringify(canonicalize(value));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
