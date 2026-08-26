/**
 * Dedupe key computation.
 *
 * dedupeKey = sha256(`${source}|${ruleId}|${selector}`), truncated to 16
 * hex characters. Hashed rather than concatenated because a deeply nested
 * selector on a real site can exceed MongoDB's compound index key size
 * limit, and dedupeKey needs to sit in a compound index with the site URL
 * for the monitoring tier later.
 *
 * The third argument is the candidate's identity, not necessarily a
 * selector: page-scoped findings pass the empty string, the same-page
 * aggregation pass passes the canonical page URL, and a candidate carrying
 * FindingCandidate.dedupeIdentity passes that instead. This function does
 * not care which; it only hashes what it is given.
 *
 * Selectors are still never normalized or rewritten before hashing. A real
 * 10-page scan already collapsed 27 contrast nodes into 3 footer selectors
 * with no normalization at all, and rewriting selectors risks merging
 * genuinely distinct elements - confirmed by counter-example on real sites,
 * where a naive "strip hex-looking ids" rule would have merged
 * #popmake-12288 with #popmake-13138 (two different popups) and distinct
 * Webflow w-node-* ids (build-stable, one per element). B4's fix for
 * duplicate Lighthouse image findings therefore does not touch selectors at
 * all: it gives those rules a better identity (the resource URL) rather
 * than a damaged version of the wrong one. See normalize-lighthouse.ts's
 * RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS.
 */

import { createHash } from 'node:crypto';
import type { FindingSource } from '../types/findings.js';

const DEDUPE_KEY_LENGTH = 16;

export function computeDedupeKey(source: FindingSource, ruleId: string, selector: string): string {
  return createHash('sha256')
    .update(`${source}|${ruleId}|${selector}`)
    .digest('hex')
    .slice(0, DEDUPE_KEY_LENGTH);
}
