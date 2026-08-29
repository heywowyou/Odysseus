import type { OutreachProseInput } from '../outreach-input.js';
import type { OutreachProseOutput } from '../outreach-schema.js';
import { outreachProseFields } from '../outreach-schema.js';

/**
 * The alias e1/e2 is narrower here than finding-alias.ts's structure-pass use:
 * it is not a lookup key the model resolves findings through, it is a
 * declaration the model echoes back to confirm which evidence item it wrote
 * about. outreachTouch1OutputSchema and outreachTouch2OutputSchema already
 * pin evidenceRef to the single literal each touch may carry, so a mismatch
 * cannot survive zod's own .parse() today. The check here is defense in
 * depth against a caller bug (the wrong branch's alias passed into the wrong
 * touch's schema in outreach-client.ts's touch dispatch), not a property the
 * schema leaves open by itself.
 *
 * The second check has no such backstop: nothing stops the model writing the
 * bare token "e1" or "e2" inside a free-text field, which would leak an
 * internal identifier into a cold email exactly the way finding-alias.ts's
 * own doc comment describes for the structure pass.
 */
export interface AliasGuardViolation {
  field: string;
  text: string;
  reason: 'evidence-ref-mismatch' | 'alias-leaked-in-prose';
  matched?: string;
}

const ALIAS_LEAK_PATTERN = /\be[12]\b/i;

export function findAliasViolations(
  input: OutreachProseInput,
  output: OutreachProseOutput,
): AliasGuardViolation[] {
  const violations: AliasGuardViolation[] = [];
  const expectedRef = input.evidence?.alias;

  if (output.touch === 1 && output.evidenceRef !== expectedRef) {
    violations.push({
      field: 'evidenceRef',
      text: output.evidenceRef,
      reason: 'evidence-ref-mismatch',
    });
  }
  if (output.touch === 2 && output.evidenceRef !== expectedRef) {
    violations.push({
      field: 'evidenceRef',
      text: output.evidenceRef,
      reason: 'evidence-ref-mismatch',
    });
  }

  for (const { field, text } of outreachProseFields(output)) {
    const match = text.match(ALIAS_LEAK_PATTERN);
    if (match) {
      violations.push({ field, text, reason: 'alias-leaked-in-prose', matched: match[0] });
    }
  }

  return violations;
}
