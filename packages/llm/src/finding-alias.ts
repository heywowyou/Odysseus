/**
 * A gapless alias ID space for the structure pass, added 2026-08-24.
 *
 * Why this exists. Findings reach the model already filtered: filterFindingsForLlm
 * drops some, and partitionFindings (diversion.ts, trade-off 8) deliberately
 * withholds others. Real finding IDs are assigned globally across the whole
 * site before either filter runs, so what the model actually sees is a sparse
 * sequence with holes in it - and a hole that lands in the middle of an
 * otherwise contiguous run of the same rule is an invitation the model cannot
 * refuse. A real La Corniche audit failed all six structure attempts by
 * inventing exactly f320: f316-f319 and f321-f324 were all present, all the
 * same rule, so the model closed the run. f320 was a diverted finding, one the
 * diversion rule exists to keep out of its hands.
 *
 * structure-prompt.ts used to carry an explicit paragraph telling the model
 * that numeric gaps are normal and never to complete a sequence. It failed six
 * times out of six against that same audit, which is the argument for removing
 * the hole rather than asking the model to respect it.
 *
 * The safety property this buys. Aliases are assigned densely over exactly the
 * findings the model is shown, so every ID in range denotes a finding that was
 * genuinely in its input. Completing a run can therefore no longer surface a
 * withheld finding; at worst it pulls in a neighbouring finding the model did
 * see, which is a grouping-quality question, not a breach of the rule that the
 * model may never introduce a finding absent from its input. Anything outside
 * the range is still a hard rejection, unchanged.
 *
 * Aliases never leave this package: analyze-structure.ts resolves them back to
 * real IDs before it returns, so structure.json on disk, the staleness check
 * that reads it, and buildWritingInput all keep seeing real finding IDs. The
 * 'x' prefix is deliberately not 'f' so an alias that ever did escape into a
 * stored artifact would be obvious on sight rather than plausible.
 */
import type { Finding } from '@odysseus/core';
import type { StructureInput, StructurePassOutput } from './structure-schema.js';

export interface FindingAliasMap {
  /** real finding ID -> dense alias */
  readonly toAlias: ReadonlyMap<string, string>;
  /** dense alias -> real finding ID */
  readonly toReal: ReadonlyMap<string, string>;
  /** The alias-space equivalent of the input findings, for the guards. */
  readonly aliasedIds: readonly { findingId: string }[];
}

export function buildFindingAliasMap(findings: readonly Finding[]): FindingAliasMap {
  const toAlias = new Map<string, string>();
  const toReal = new Map<string, string>();

  findings.forEach((finding, index) => {
    const alias = `x${index + 1}`;
    toAlias.set(finding.findingId, alias);
    toReal.set(alias, finding.findingId);
  });

  return {
    toAlias,
    toReal,
    aliasedIds: [...toReal.keys()].map((findingId) => ({ findingId })),
  };
}

/** Rewrites the findings the model is shown into the alias space. Nothing
 *  else about the input changes: same order, same fields, same site context. */
export function aliasStructureInput(input: StructureInput, map: FindingAliasMap): StructureInput {
  return {
    ...input,
    findings: input.findings.map((finding) => {
      const alias = map.toAlias.get(finding.findingId);
      if (alias === undefined) {
        // The map is built from the same array buildStructureInput consumed, so
        // this is a programming error in the caller, not a model failure - it
        // must not be swallowed into the retry loop.
        throw new Error(
          `odysseus analyze (structure pass): no alias for finding "${finding.findingId}"; the alias map and the structure input disagree`,
        );
      }
      return { ...finding, findingId: alias };
    }),
  };
}

/** Maps a validated structure output back out of the alias space. Only called
 *  after the invented-ID guard has already run against the alias set, so every
 *  ID here is known to resolve. */
export function resolveStructureOutputIds(
  output: StructurePassOutput,
  map: FindingAliasMap,
): StructurePassOutput {
  const resolve = (alias: string): string => {
    const real = map.toReal.get(alias);
    if (real === undefined) {
      throw new Error(
        `odysseus analyze (structure pass): alias "${alias}" survived the invented-ID guard but has no real finding ID`,
      );
    }
    return real;
  };

  return {
    ...output,
    themes: output.themes.map((theme) => ({ ...theme, findingIds: theme.findingIds.map(resolve) })),
    quickWins: output.quickWins.map(resolve),
  };
}
