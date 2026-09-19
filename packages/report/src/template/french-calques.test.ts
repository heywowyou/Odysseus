/**
 * The French report copy must read as written in French, not translated
 * from English. A native-speaker review of two delivered reports found
 * recurring calques ("Pourquoi cela compte" for "Why it matters", "Gain
 * rapide" for "quick win", "servir du contenu" for "serve content") and
 * internal jargon ("scan", "remédiation", "à traiter directement") spread
 * across the deterministic strings. This guard keeps each rewritten
 * phrasing from drifting back into the files that hold French client copy.
 *
 * Whole-line comments document the strings and are not copy, so they are
 * skipped. The model-written prose is held to the same list through the
 * writing prompt and docs/rules/report-writing-style.md, not here.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FRENCH_COPY_FILES = [
  'strings/fr.ts',
  'strings/fr-client-facing.ts',
  'rule-translations.ts',
  'remediation/fr.ts',
  '../outreach-preview/strings-v3.ts',
];

const CALQUES: ReadonlyArray<readonly [string, RegExp]> = [
  ['why it matters', /Pourquoi cela compte/u],
  ['based on (sentence opener)', /['"]Basé sur\b/u],
  ['vague ownership wording', /traiter directement/u],
  ['remediation', /\bRemédiation\b/u],
  ['measured results', /Résultats mesurés/u],
  ['quick win', /Gains? rapides?/iu],
  ['extended pass', /passe d['’]accessibilité/u],
  ['young evidence base', /corpus de preuves/u],
  ['obligation status', /statut d['’]obligation/iu],
  ['serve content', /\b(?:Servez|servir aux|Cessez de servir)\b/u],
  ['scan (noun)', /\b(?:le|du|ce|un) scan\b|\bversion de scan\b|\bscan achevé\b/iu],
  ['around a range', /autour de \d+ à \d+/u],
  ['meta description', /\bmeta description\b/iu],
  ['captured on its own', /capturée seule/u],
  ['first content', /Le premier contenu met du temps/u],
  ['visible content fills', /se remplit lentement/u],
  ['identify as an entity', /comme une entité/u],
  ['a union', /\bune union\b/u],
  ['speed experienced', /effectivement vécue/u],
  ['cover a finding', /\b(?:couvren?t?|Couvrant) au moins un constat/iu],
];

describe('French client copy avoids known English calques', () => {
  it.each(FRENCH_COPY_FILES)('%s', async (relativePath) => {
    const content = await fs.readFile(path.resolve(__dirname, relativePath), 'utf-8');
    const offenders: string[] = [];
    content.split('\n').forEach((line, index) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      for (const [name, pattern] of CALQUES) {
        if (pattern.test(line)) offenders.push(`${index + 1} (${name}): ${trimmed.slice(0, 100)}`);
      }
    });
    expect(offenders).toEqual([]);
  });

  it('catches a reintroduced calque', () => {
    const hits = CALQUES.filter(([, pattern]) =>
      pattern.test('Servez ces images dans un format moderne.'),
    );
    expect(hits.map(([name]) => name)).toEqual(['serve content']);
  });
});
