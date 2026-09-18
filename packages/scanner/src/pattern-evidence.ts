/**
 * Conservative pattern evidence for Plan 059 step 27 (plan section 5.15):
 * non-authoritative root-cause support derived from the observation ledger.
 *
 * When one rule's observations repeat with the same stable structural
 * signature on several pages, the most likely explanation is one shared
 * component (a template partial, a widget, one CMS block) carrying the
 * same defect everywhere it is rendered. This module records exactly that
 * observation — nothing more. It never merges or rewrites findings, never
 * changes finding identity, totals or dedupe, and never claims to know
 * where the component lives in the client's source code; its records carry
 * both `authoritativeForFindingIdentity: false` and
 * `provesSourceCodeOwnership: false`.
 *
 * The signature is deliberately conservative. Anything volatile (ids,
 * numeric or generated class names, attribute values, nth positions,
 * state pseudo-classes) is stripped, and a selector that cannot be reduced
 * to at least one stable element/class per ancestor compound yields no
 * signature at all — which means no pattern. A missing pattern is always
 * preferred over a wrong one.
 */
import type { Finding } from '@odysseus/core';
import { buildPatternEvidenceRecord, type PatternEvidenceRecord } from './evidence-ledger.js';

/** The minimum distinct pages a repeated signature must span before it may
 *  be called a shared-component pattern. Within one page it could be a
 *  local repetition; across pages it behaves like one deployed component. */
export const MIN_PATTERN_PAGE_COUNT = 2;

/** Distinct pages from which a pattern is broad enough to call high
 *  confidence. Provisional until the plan's corpus runs (handoff 4.3),
 *  and only ever widens or narrows the confidence label — never the
 *  pattern's existence. */
const HIGH_CONFIDENCE_PAGE_COUNT = 5;

/**
 * Reduces one finding selector to a stable structural signature of the
 * component it matches, or `undefined` when no safe signature exists.
 *
 * Stripped as volatile: ids, nth/state pseudo-classes, attribute selectors
 * (the whole compound is refused), and class names carrying digits or the
 * `css-`/`sc-` CSS-in-JS prefixes. Two components that differ only in
 * stripped detail may share a signature only if what remains is identical
 * — and any compound that reduces to nothing refuses the whole selector.
 */
export function structuralSignatureOf(selector: string): string | undefined {
  const trimmed = selector.trim();
  if (trimmed === '' || /['"[]/.test(trimmed)) return undefined;
  const compounds = trimmed.replace(/>/gu, ' ').split(/\s+/u);
  const stable: string[] = [];
  for (const compound of compounds) {
    const withoutPseudo = compound.replace(/::?[a-zA-Z-]+(?:\([^)]*\))?/gu, '');
    const match = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/u.exec(withoutPseudo);
    if (match === null) return undefined;
    const tag = match[1] !== undefined && match[1] !== '*' ? match[1].toLowerCase() : undefined;
    // Ids are page-instance artifacts: dropped outright, never read as
    // structure. An id-only compound therefore refuses the signature.
    const tokens = (match[2] ?? '').match(/[.#][\w-]+/gu) ?? [];
    const classes = tokens
      .filter((token) => token[0] === '.')
      .map((token) => token.slice(1))
      .filter((name) => isStableClassName(name));
    const parts = [...(tag !== undefined ? [tag] : []), ...classes.map((name) => `.${name}`)];
    if (parts.length === 0) return undefined;
    stable.push(parts.join(''));
  }
  return stable.length === 0 ? undefined : stable.join(' > ');
}

/** A class name is stable only when it cannot be a per-build or per-state
 *  artifact: no digits anywhere (generated hashes, numeric utilities like
 *  `col-6`), at least two characters, and not a CSS-in-JS marker prefix. */
function isStableClassName(name: string): boolean {
  if (name.length < 2) return false;
  if (/[0-9]/u.test(name)) return false;
  if (/^(css|sc)-/iu.test(name)) return false;
  return /^[a-zA-Z_][a-zA-Z_-]*$/u.test(name);
}

/** One confirmed finding's observation, as the pattern collector needs it. */
export interface PatternObservationRef {
  observationId: string;
  pageUrl: string;
  selector?: string;
}

interface PatternGroup {
  ruleId: string;
  category: string;
  structuralSignature: string;
  observationIds: Set<string>;
  pageUrls: Set<string>;
}

export interface PatternEvidenceCollector {
  note(finding: Finding, observations: readonly PatternObservationRef[]): void;
  build(): PatternEvidenceRecord[];
}

/**
 * Groups confirmed findings' observations by (rule, stable signature). Only
 * confirmed findings may be noted: heuristic signals stay in their own
 * ledger and are never promoted into pattern support. `build` returns one
 * record per group spanning at least two pages, sorted by pattern id.
 */
export function createPatternEvidenceCollector(): PatternEvidenceCollector {
  const groups = new Map<string, PatternGroup>();
  return {
    note(finding, observations) {
      for (const observation of observations) {
        if (observation.selector === undefined) continue;
        const structuralSignature = structuralSignatureOf(observation.selector);
        if (structuralSignature === undefined) continue;
        const key = `${finding.ruleId}|${structuralSignature}`;
        const group = groups.get(key) ?? {
          ruleId: finding.ruleId,
          category: finding.category,
          structuralSignature,
          observationIds: new Set<string>(),
          pageUrls: new Set<string>(),
        };
        group.observationIds.add(observation.observationId);
        group.pageUrls.add(observation.pageUrl);
        groups.set(key, group);
      }
    },
    build() {
      const records: PatternEvidenceRecord[] = [];
      for (const group of groups.values()) {
        if (group.pageUrls.size < MIN_PATTERN_PAGE_COUNT) continue;
        const pages = group.pageUrls.size;
        const record = buildPatternEvidenceRecord({
          title: `${group.ruleId} recurs on one shared component across ${pages} pages`,
          ruleId: group.ruleId,
          category: group.category,
          observationIds: [...group.observationIds],
          affectedPageIdentities: [...group.pageUrls],
          structuralSignature: group.structuralSignature,
          confidence: pages >= HIGH_CONFIDENCE_PAGE_COUNT ? 'high' : 'medium',
          reasonCode: 'shared-structural-signature',
        });
        records.push(record);
      }
      return records.sort((a, b) => a.patternId.localeCompare(b.patternId));
    },
  };
}
