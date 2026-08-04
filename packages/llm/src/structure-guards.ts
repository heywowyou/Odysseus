/**
 * Small, deliberate duplication of core's findInventedFindingIds /
 * findUnreferencedFindingIds (packages/core/src/types/llm-output.ts),
 * against the structure pass's own (non-locked) output shape instead of
 * the locked LlmOutput/Theme shape those functions are typed for. Same
 * precedent as output-schema.ts and config.ts in this package, both of
 * which hand-duplicate logic next to a file they are not allowed to
 * touch. Keep in sync by hand. See docs/llm-layer-rules.md section 9.
 */
import type { Finding } from '@odysseus/core';
import type { StructurePassOutput } from './structure-schema.js';

/** Hard guard against invented findings, run against the structure
 *  pass's output - the only pass that decides findingIds. A non-empty
 *  result is a hard rejection: logged, retried, then fail-loud. */
export function findInventedStructureFindingIds(
  output: StructurePassOutput,
  inputFindings: readonly Finding[],
): string[] {
  const known = new Set(inputFindings.map((f) => f.findingId));
  const referenced = new Set<string>();

  for (const theme of output.themes) {
    for (const id of theme.findingIds) referenced.add(id);
  }
  for (const id of output.quickWins) referenced.add(id);

  return [...referenced].filter((id) => !known.has(id));
}

/** Coverage check. Not a hard failure, but a report that silently drops
 *  half the findings is a quality problem worth surfacing. */
export function findUnreferencedStructureFindingIds(
  output: StructurePassOutput,
  inputFindings: readonly Finding[],
): string[] {
  const referenced = new Set<string>();
  for (const theme of output.themes) {
    for (const id of theme.findingIds) referenced.add(id);
  }
  return inputFindings.map((f) => f.findingId).filter((id) => !referenced.has(id));
}
