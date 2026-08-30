import type { StatSector } from './types.js';

/**
 * Hospitality NAF-code classification for reference-stat selection
 * only. Deliberately independent from
 * prospecting/config/naf-sector-allowlist.json, which
 * docs/rules/prospect-qualification.md section 4 forbids citing to a
 * prospect as evidence of anything - that table drives recall
 * filtering for outreach targeting; this one drives which citation
 * text a paid report shows. Conflating them would let an edit made for
 * one purpose silently change the other. See CLAUDE.md trade-off 15.
 */
const HOSPITALITY_NAF_PREFIXES: readonly string[] = ['55.', '56.']; // hébergement / restauration

/** Falls back to 'general' for empty, malformed, or unrecognised
 *  codes - there is no third sector, and a failed classification must
 *  never silently narrow which stats a client sees. */
export function detectSector(nafCode: string): StatSector {
  const normalized = nafCode.trim().toUpperCase();
  return HOSPITALITY_NAF_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ? 'hospitality'
    : 'general';
}
