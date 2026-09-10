/**
 * Same enforcement mechanism as template/remediation/remediation.test.ts and
 * template/rule-translations.test.ts, pointed at the public proof-card copy.
 *
 * The proof card is prospect-facing, so the bar is higher than a missing
 * sentence: an uncovered rule id must fail the build rather than quietly leave
 * the card off (selection itself fails closed, so this test is where the gap
 * actually shows). The style assertions keep the catalog inside the
 * public-safe copy rules: observed problems only, no fixes, no legal
 * conclusions, no statistics, no technical identifiers, and the approved
 * observation sentences reused verbatim rather than reworded.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECK_SEVERITY, HOTEL_EVIDENCE_OBSERVATIONS } from '@odysseus/core';
import { loadObservedFixtureRuleIds } from '../test-fixtures.js';
import { OUTREACH_PROOF_CARD_COPY } from './proof-card-copy.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const reachable = JSON.parse(
  readFileSync(path.join(moduleDir, '../template/reachable-rule-ids.json'), 'utf-8'),
) as { axe: string[]; lighthouse: string[] };

/** The two committed source lists a rule id can come from; CUSTOM_CHECK_SEVERITY
 *  is the third. The pinned observed ids join them in the coverage test. */
const sourceUnion = new Set<string>([
  ...reachable.axe,
  ...reachable.lighthouse,
  ...Object.keys(CUSTOM_CHECK_SEVERITY),
]);

/** The rule ids the committed reference audits have actually observed. Broader
 *  than loadObservedFixtureRuleIds(), which reads only the three committed
 *  findings fixtures and misses ids those fixtures no longer exercise. */
const pinnedObserved = JSON.parse(
  readFileSync(
    path.join(moduleDir, '../../../../fixtures/test-audits/observed-rule-ids.json'),
    'utf-8',
  ),
) as string[];

describe('proof-card copy coverage', () => {
  it('covers exactly the union of the three finding sources and the observed set', () => {
    const union = new Set([...sourceUnion, ...pinnedObserved]);
    expect(union.size).toBeGreaterThan(150);
    expect(Object.keys(OUTREACH_PROOF_CARD_COPY).sort()).toEqual([...union].sort());
  }, 20000);

  it('also covers every rule id the committed reference audits currently emit', async () => {
    const observed = await loadObservedFixtureRuleIds();
    const uncovered = [...observed].filter((id) => OUTREACH_PROOF_CARD_COPY[id] === undefined);
    expect(uncovered, `observed rules with no proof-card copy: ${uncovered.join(', ')}`).toEqual(
      [],
    );
  });

  /**
   * A handful of pinned observed ids sit outside both committed source lists
   * today: 12 Lighthouse audits from drift between the audit that produced the
   * fixtures and the installed scanner, plus the render-diff check, which is a
   * custom rule with no CUSTOM_CHECK_SEVERITY entry. They are covered like any
   * other id; this pin makes any change to that boundary a conscious edit.
   */
  it('pins the observed rule ids that no committed source list claims', () => {
    const outside = pinnedObserved.filter((id) => !sourceUnion.has(id)).sort();
    expect(outside).toEqual([
      'dom-size',
      'font-display',
      'lcp-lazy-loaded',
      'legacy-javascript',
      'offscreen-images',
      'prioritize-lcp-image',
      'render-blocking-resources',
      'text-missing-from-raw-html',
      'third-party-summary',
      'uses-http2',
      'uses-long-cache-ttl',
      'uses-rel-preconnect',
      'uses-text-compression',
    ]);
  });
});

const ALL_TEXT: Array<[string, 'fr' | 'en', string]> = Object.entries(
  OUTREACH_PROOF_CARD_COPY,
).flatMap(([ruleId, entry]) => [
  [ruleId, 'fr', entry.fr] as [string, 'fr' | 'en', string],
  [ruleId, 'en', entry.en] as [string, 'fr' | 'en', string],
]);

describe('proof-card copy style', () => {
  it('writes one short declarative sentence in every entry', () => {
    const bad = ALL_TEXT.filter(([, , text]) => {
      const oneSentence = (text.match(/\./gu) ?? []).length === 1 && text.endsWith('.');
      return !oneSentence || text.length < 20 || text.length > 160 || /[;:]/u.test(text);
    });
    expect(bad.map(([ruleId, lang]) => `${ruleId} (${lang})`)).toEqual([]);
  });

  it('stays public-safe: no identifiers, statistics, markup, or layout accidents', () => {
    const bad = ALL_TEXT.filter(([, , text]) => {
      return (
        /[\u2013\u2014\u202F\u00A0]/u.test(text) || // dashes, narrow and no-break spaces
        /%|\d/u.test(text) || // percentages, figures, statistics
        /http|www\.|\.com\b|\.fr\b/iu.test(text) || // addresses and hostnames
        /[<>{}]/u.test(text) || // markup, selectors, code fragments
        /^[-#.]/u.test(text) || // list or heading fragments
        / {2}|\t/u.test(text) || // spacing accidents
        text.includes('"') // straight double quote
      );
    });
    expect(bad.map(([ruleId, lang]) => `${ruleId} (${lang})`)).toEqual([]);
  });

  // Words that exist in only one of the two languages, so a string carrying one
  // is in the wrong table. Shared words such as page, site, or table are
  // deliberately absent from both lists.
  const ENGLISH_ONLY =
    /\b(the|and|with|for|from|that|this|has|have|not|its|which|while|without|instead)\b/iu;
  const FRENCH_ONLY =
    /\b(les|des|une|pas|est|aux|dans|pour|qui|ne|ou|aucun|étiquette|établissement)\b/iu;

  it('keeps French and English apart', () => {
    const frLeaking = Object.entries(OUTREACH_PROOF_CARD_COPY).filter(([, entry]) =>
      ENGLISH_ONLY.test(entry.fr),
    );
    const enLeaking = Object.entries(OUTREACH_PROOF_CARD_COPY).filter(([, entry]) =>
      FRENCH_ONLY.test(entry.en),
    );
    expect(frLeaking.map(([ruleId]) => ruleId)).toEqual([]);
    expect(enLeaking.map(([ruleId]) => ruleId)).toEqual([]);
  });
});

/**
 * ruleId to key in HOTEL_EVIDENCE_OBSERVATIONS. Where a proof card describes
 * the same measured fact as the approved evidence vocabulary, the sentence is
 * the allowlist sentence, not a rewording of it, so the two public documents
 * can never disagree about what the same defect is called.
 */
const OBSERVATION_RULE_MAP: Readonly<Record<string, string>> = {
  'color-contrast': 'color-contrast',
  'keyboard-trap': 'keyboard-trap',
  'text-missing-from-raw-html': 'text-missing-from-raw-html',
  'form-error-not-associated': 'form-error-not-associated',
  'target-size': 'target-size',
  'button-name': 'button-name',
  'link-name': 'link-name',
  'image-alt': 'image-alt',
  label: 'label',
  'html-has-lang': 'html-has-lang',
  'structured-data-entity-missing': 'structured-data-entity-missing',
  'entity-data-incomplete': 'entity-data-incomplete',
};

describe('approved observation reuse', () => {
  it('reuses the approved observation sentences verbatim for their rules', () => {
    for (const [ruleId, observationKey] of Object.entries(OBSERVATION_RULE_MAP)) {
      const observation = HOTEL_EVIDENCE_OBSERVATIONS[observationKey];
      expect(observation, `observation ${observationKey} exists`).toBeDefined();
      const entry = OUTREACH_PROOF_CARD_COPY[ruleId];
      expect(entry, `proof-card entry for ${ruleId} exists`).toBeDefined();
      expect(entry?.fr, `${ruleId} fr`).toBe(observation?.fr);
      expect(entry?.en, `${ruleId} en`).toBe(observation?.en);
    }
  });

  it('maps every approved observation to a rule, so none can be added unmapped', () => {
    expect(Object.values(OBSERVATION_RULE_MAP).sort()).toEqual(
      Object.keys(HOTEL_EVIDENCE_OBSERVATIONS).sort(),
    );
  });
});
