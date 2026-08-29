/**
 * Guard against two copy defects found in the 2026-08-29 improve pass,
 * both in client-facing report strings:
 *
 * 1. reportIntro.consequenceRegulatory asserted "A regulatory exposure
 *    already documented" / "Une exposition réglementaire déjà
 *    documentée" - a client-specific legal conclusion, which the charter
 *    forbids ("we report, we do not conclude": the report states criteria
 *    and verified facts, and defers the binding question to counsel).
 *    The bullet now states conditionality and carries the house deferral
 *    phrase, and this test requires both.
 *
 * 2. findingsAppendix.thirdPartyCountedInTotalsNote read as two flat
 *    contradictory propositions: "a real conformance gap under the
 *    standard, even when the specific implementation observed here
 *    already turns out to be correct". The P2.3 intent (explaining why a
 *    no-action finding still counts in the cover totals) is preserved,
 *    but as an explanation of how the two statements compose rather than
 *    as both assertions stacked in one sentence.
 */
import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { fr } from './fr.js';

describe('consequenceRegulatory states criteria and defers, never a documented exposure', () => {
  it.each([
    ['fr', fr.reportIntro.consequenceRegulatory],
    ['en', en.reportIntro.consequenceRegulatory],
  ])('%s bullet carries no client-specific exposure assertion (%s)', (_lang, text) => {
    expect(text).not.toMatch(/already documented|déjà documentée/);
    expect(text).toMatch(/may apply|peuvent s'appliquer/);
  });

  it.each([
    ['fr', fr.reportIntro.consequenceRegulatory],
    ['en', en.reportIntro.consequenceRegulatory],
  ])('%s bullet defers to legal counsel (%s)', (_lang, text) => {
    expect(text).toMatch(/legal adviser|legal counsel|conseil juridique/);
  });
});

describe('thirdPartyCountedInTotalsNote explains the totals instead of asserting both sides', () => {
  it.each([
    ['fr', fr.findingsAppendix.thirdPartyCountedInTotalsNote],
    ['en', en.findingsAppendix.thirdPartyCountedInTotalsNote],
  ])('%s note asserts no flat conformance-gap contradiction (%s)', (_lang, text) => {
    expect(text).not.toMatch(/real conformance gap|écart de conformité réel/);
    expect(text).not.toMatch(
      /even when the specific implementation[^.]*already turns out to be correct/,
    );
  });

  it.each([
    ['fr', fr.findingsAppendix.thirdPartyCountedInTotalsNote],
    ['en', en.findingsAppendix.thirdPartyCountedInTotalsNote],
  ])('%s note keeps both facts as rule-versus-case composition (%s)', (_lang, text) => {
    expect(text).toMatch(/general (severity|rule)|(gravité générale|règle générale)/);
    expect(text).toMatch(/your (site|case)|(votre site|votre cas)/);
  });
});
