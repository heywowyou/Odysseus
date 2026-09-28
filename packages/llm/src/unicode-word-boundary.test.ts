import { describe, expect, it } from 'vitest';
import { hasFindingCountViolation } from './finding-count-guard.js';
import {
  findLegalConsequenceViolationsInFields,
  LEGAL_CONSEQUENCE_PATTERNS,
} from './legal-consequence-guard.js';
import {
  FRENCH_CALQUE_GLOSSARY,
  FRENCH_TERM_GLOSSARY,
  findProseRegisterViolationsInFields,
} from './prose-register-guard.js';
import { BANNED_SYNONYMS } from './severity-vocabulary-guard.js';
import { unicodeWords } from './unicode-word-boundary.js';

/** Each word ends (or starts) in an accented letter, which an ASCII \b
 *  never accepts as a word edge. */
const ACCENTED_LEGAL = [
  'une pénalité',
  "l'applicabilité de l'obligation est établie",
  'son applicabilité est confirmée',
  'une pratique illégale',
  "avant la fin de l'année",
  'avant cet été',
];
const ACCENTED_REGISTER = [
  "Sur l'accessibilité",
  'une identification structurée',
  'les axes mesurés',
  'un accès visuel',
];
const ACCENTED_SEVERITY = ['sévère', 'sévères'];
const FOLLOWERS = [' suit', ', suit', ''];

const legalHits = (text: string): number =>
  findLegalConsequenceViolationsInFields([{ field: 'f', text }], 'fr').length;
const registerHits = (text: string): number =>
  findProseRegisterViolationsInFields([{ field: 'f', text }], 'fr').length;

describe('French guards on words that end in an accented letter', () => {
  for (const follower of FOLLOWERS) {
    const label = follower === '' ? 'the end of the text' : JSON.stringify(follower.trim());
    it(`reject a legal conclusion followed by ${label}`, () => {
      for (const phrase of ACCENTED_LEGAL) expect(legalHits(`${phrase}${follower}`)).toBe(1);
    });
    it(`reject a register calque followed by ${label}`, () => {
      for (const phrase of ACCENTED_REGISTER) {
        expect(registerHits(`${phrase}${follower}`)).toBeGreaterThan(0);
      }
    });
    it(`reject a banned severity synonym followed by ${label}`, () => {
      for (const word of ACCENTED_SEVERITY) {
        const text = `un défaut ${word}${follower}`;
        expect(BANNED_SYNONYMS.fr.some((pattern) => pattern.test(text))).toBe(true);
      }
    });
    it(`reject an invented singular severity count followed by ${label}`, () => {
      expect(hasFindingCountViolation(`1 modéré${follower}`, 'fr')).toBe(true);
    });
  }

  it('still reads an accented letter as part of the word, not as its edge', () => {
    expect(legalHits('une pénalitée')).toBe(0);
    expect(hasFindingCountViolation('1 modérément', 'fr')).toBe(false);
  });

  it('keeps every guard table on Unicode word boundaries', () => {
    const tables = [
      ...LEGAL_CONSEQUENCE_PATTERNS.fr,
      ...LEGAL_CONSEQUENCE_PATTERNS.en,
      ...BANNED_SYNONYMS.fr,
      ...FRENCH_TERM_GLOSSARY.map((entry) => entry.pattern),
      ...FRENCH_CALQUE_GLOSSARY.map((entry) => entry.pattern),
    ];
    for (const pattern of tables) {
      expect(pattern.flags).toContain('u');
      expect(pattern.source).not.toMatch(/(?<!\\)\\[bw]/);
    }
  });
});

describe('unicodeWords', () => {
  it('refuses \\b inside a character class, where it means backspace', () => {
    expect(() => unicodeWords(/[\b]/)).toThrow(/character class/);
  });

  it('keeps other escapes and adds the u flag once', () => {
    const pattern = unicodeWords(/\bprix\s+\d+\.\d\b/iu);
    expect(pattern.flags).toBe('iu');
    expect(pattern.test('le prix 3.5 €')).toBe(true);
  });
});
