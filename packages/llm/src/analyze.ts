import { findInventedFindingIds, findUnreferencedFindingIds } from '@odysseus/core';
import type { Finding, LlmInput, LlmOutput } from '@odysseus/core';
import { callClaude } from './client.js';
import { CLAUDE_EFFORT, CLAUDE_MODEL, MAX_RETRIES } from './constants.js';

export interface AnalyzeResult {
  output: LlmOutput;
  model: string;
  effort: string;
  unreferencedFindingCount: number;
}

/** Retry-and-guard orchestration enforcing the governing rule:
 *  deterministic scanners detect, the LLM explains, and any response
 *  referencing a finding ID absent from its input is rejected, logged,
 *  and retried, then fails loudly rather than shipping a partial or
 *  untraceable analysis. See docs/llm-layer-rules.md section 2.
 *
 *  filteredFindings must be the exact array passed into buildLlmInput to
 *  produce `input` - the guard functions must see exactly what the
 *  model saw, never the unfiltered full set. See section 1. */
export async function analyzeFindings(
  input: LlmInput,
  filteredFindings: readonly Finding[],
  usedFallbackContext: boolean,
): Promise<AnalyzeResult> {
  let lastFailureReason = '';

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const result = await callClaude(input, usedFallbackContext);

    if (result.refused || !result.output) {
      lastFailureReason = 'Claude declined to respond (stop_reason: refusal)';
      console.error(
        `odysseus analyze: attempt ${attempt}/${MAX_RETRIES + 1} refused by the model, retrying if attempts remain`,
      );
      continue;
    }

    const invented = findInventedFindingIds(result.output, filteredFindings as Finding[]);
    if (invented.length > 0) {
      lastFailureReason = `response referenced finding ID(s) not present in the input: ${invented.join(', ')}`;
      console.error(
        `odysseus analyze: attempt ${attempt}/${MAX_RETRIES + 1} rejected - invented finding IDs: ${invented.join(', ')}`,
      );
      continue;
    }

    const unreferenced = findUnreferencedFindingIds(result.output, filteredFindings as Finding[]);
    if (unreferenced.length > 0) {
      console.warn(
        `odysseus analyze: warning - ${unreferenced.length} finding(s) not referenced by any theme: ${unreferenced.join(', ')}`,
      );
    }

    return {
      output: result.output,
      model: CLAUDE_MODEL,
      effort: CLAUDE_EFFORT,
      unreferencedFindingCount: unreferenced.length,
    };
  }

  throw new Error(
    `odysseus analyze: exhausted ${MAX_RETRIES + 1} attempts without a valid response. Last failure: ${lastFailureReason}`,
  );
}
