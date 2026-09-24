/**
 * Data-quality limitations are stored with each audit's evidence, in the
 * scanner wording current when the audit ran. Until 2026-09-24 that wording
 * called the crawler "notre robot", which the French preview lint forbids
 * as internal-tool vocabulary, so every preview built from an older audit
 * was rejected. The preview shows the current wording instead; the stored
 * evidence and the paid report are left untouched, so their digests and
 * provenance stay valid.
 *
 * Each pair maps an exact legacy phrase to the phrase the scanner writes
 * today. Order matters: the longer French phrases come first so the shorter
 * one cannot pre-empt them.
 */
const LEGACY_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ['le défilement de notre robot', "le défilement effectué par notre outil d'analyse"],
  ["l'identité publiée de notre robot", "l'identité publiée de notre outil d'analyse"],
  ["notre robot d'analyse", "notre outil d'analyse"],
  ['our published crawler identity', "our analysis tool's published identity"],
  ['our crawler', 'our analysis tool'],
];

export function currentLimitationWording(text: string): string {
  let current = text;
  for (const [legacy, replacement] of LEGACY_PHRASES) {
    current = current.split(legacy).join(replacement);
  }
  return current;
}
