/**
 * Dedupe key computation.
 *
 * dedupeKey = sha256(`${source}|${ruleId}|${selector}`), truncated to 16
 * hex characters. Hashed rather than concatenated because a deeply nested
 * selector on a real site can exceed MongoDB's compound index key size
 * limit, and dedupeKey needs to sit in a compound index with the site URL
 * for the monitoring tier later.
 *
 * selector is the empty string for page-scoped findings. Selectors are
 * never normalized or rewritten before hashing: a real 10-page scan
 * already collapsed 27 contrast nodes into 3 footer selectors with no
 * normalization at all, and aggressive normalization risks merging
 * genuinely distinct elements.
 */

import { createHash } from 'node:crypto';
import type { FindingSource } from '../types/findings.js';

const DEDUPE_KEY_LENGTH = 16;

export function computeDedupeKey(
  source: FindingSource,
  ruleId: string,
  selector: string,
): string {
  return createHash('sha256')
    .update(`${source}|${ruleId}|${selector}`)
    .digest('hex')
    .slice(0, DEDUPE_KEY_LENGTH);
}
