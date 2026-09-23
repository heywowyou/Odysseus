/**
 * Small, deliberate duplication of core's findInventedFindingIds /
 * findUnreferencedFindingIds (packages/core/src/types/llm-output.ts),
 * against the structure pass's own (non-locked) output shape instead of
 * the locked LlmOutput/Theme shape those functions are typed for. Same
 * precedent as output-schema.ts and config.ts in this package, both of
 * which hand-duplicate logic next to a file they are not allowed to
 * touch. Keep in sync by hand. See docs/rules/llm-layer-rules.md section 9.
 */
import type { StructurePassOutput } from './structure-schema.js';

/** Both guards need finding IDs and nothing else. Typed structurally rather
 *  than as Finding[] so the same functions can run against finding-alias.ts's
 *  dense alias space, which is what analyze-structure.ts actually checks the
 *  model's output against. Finding[] still satisfies this. */
export interface HasFindingId {
  readonly findingId: string;
}

/** Repeated IDs inflate deterministic theme ranking. IDs may appear once
 *  across all themes and once in quickWins; quickWins overlap with themes by
 *  design, but duplicates inside either collection are rejected. Call after
 *  alias resolution so separate aliases for one finding also collide. */
export function findDuplicateStructureFindingIds(
  output: Pick<StructurePassOutput, 'themes' | 'quickWins'>,
): string[] {
  const duplicates = new Set<string>();
  const themeIds = new Set<string>();
  for (const theme of output.themes) {
    for (const id of theme.findingIds) {
      if (themeIds.has(id)) duplicates.add(id);
      else themeIds.add(id);
    }
  }
  const quickWinIds = new Set<string>();
  for (const id of output.quickWins) {
    if (quickWinIds.has(id)) duplicates.add(id);
    else quickWinIds.add(id);
  }
  return [...duplicates];
}

/** Hard guard against invented findings, run against the structure
 *  pass's output - the only pass that decides findingIds. A non-empty
 *  result is a hard rejection: logged, retried, then fail-loud. */
export function findInventedStructureFindingIds(
  output: StructurePassOutput,
  inputFindings: readonly HasFindingId[],
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
  inputFindings: readonly HasFindingId[],
): string[] {
  const referenced = new Set<string>();
  for (const theme of output.themes) {
    for (const id of theme.findingIds) referenced.add(id);
  }
  return inputFindings.map((f) => f.findingId).filter((id) => !referenced.has(id));
}
