import type { Finding } from '@odysseus/core';
import { callMistralForStructure } from './client.js';
import { MISTRAL_MODEL, MISTRAL_TEMPERATURE, MAX_RETRIES } from './constants.js';
import { findInventedStructureFindingIds, findUnreferencedStructureFindingIds } from './structure-guards.js';
import { assignThemeKeys, type StructureInput, type StructureThemeWithKey } from './structure-schema.js';

export interface AnalyzeStructureResult {
  themes: StructureThemeWithKey[];
  quickWins: string[];
  overallRisk: 'low' | 'medium' | 'high';
  model: string;
  temperature: number;
  unreferencedFindingCount: number;
}

/** Retry-and-guard orchestration for the structure pass, independent of
 *  the writing pass's own retry budget. Enforces the governing rule:
 *  deterministic scanners detect, the LLM explains - any response
 *  referencing a finding ID absent from its input is rejected, logged,
 *  and retried, then fails loudly rather than shipping a partial or
 *  untraceable grouping. See docs/llm-layer-rules.md sections 2 and 9.
 *
 *  filteredFindings must be the exact array passed into
 *  buildStructureInput to produce `input` - the guard functions must see
 *  exactly what the model saw, never the unfiltered full set. See
 *  section 1. */
export async function analyzeStructure(
  input: StructureInput,
  filteredFindings: readonly Finding[],
  usedFallbackContext: boolean,
): Promise<AnalyzeStructureResult> {
  let lastFailureReason = '';

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let result: Awaited<ReturnType<typeof callMistralForStructure>>;
    try {
      result = await callMistralForStructure(input, usedFallbackContext);
    } catch (error) {
      // A malformed or truncated response (e.g. schema/JSON parse failure)
      // is a retryable attempt, not an immediate abort - same treatment as
      // an invented finding ID. Mistral has no distinct refusal signal, so
      // refusal-like model behavior also surfaces here, as a parse or
      // validation failure. Only genuinely unrecoverable errors (auth,
      // etc.) will still fail every attempt and surface via the
      // exhausted-retries error below.
      lastFailureReason = error instanceof Error ? error.message : String(error);
      console.error(
        `odysseus analyze (structure pass): attempt ${attempt}/${MAX_RETRIES + 1} failed - ${lastFailureReason}`,
      );
      continue;
    }

    const invented = findInventedStructureFindingIds(result.output, filteredFindings);
    if (invented.length > 0) {
      lastFailureReason = `response referenced finding ID(s) not present in the input: ${invented.join(', ')}`;
      console.error(
        `odysseus analyze (structure pass): attempt ${attempt}/${MAX_RETRIES + 1} rejected - invented finding IDs: ${invented.join(', ')}`,
      );
      continue;
    }

    const unreferenced = findUnreferencedStructureFindingIds(result.output, filteredFindings);
    if (unreferenced.length > 0) {
      console.warn(
        `odysseus analyze (structure pass): warning - ${unreferenced.length} finding(s) not referenced by any theme: ${unreferenced.join(', ')}`,
      );
    }

    return {
      themes: assignThemeKeys(result.output),
      quickWins: result.output.quickWins,
      overallRisk: result.output.overallRisk,
      model: MISTRAL_MODEL,
      temperature: MISTRAL_TEMPERATURE,
      unreferencedFindingCount: unreferenced.length,
    };
  }

  throw new Error(
    `odysseus analyze (structure pass): exhausted ${MAX_RETRIES + 1} attempts without a valid response. Last failure: ${lastFailureReason}`,
  );
}
