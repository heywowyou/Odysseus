import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The commercial pages, asserted as content rather than rendered.
 *
 * Same pattern as `compliance-copy.test.ts`: `packages/site` has no React
 * testing setup, so these read the page sources as text. What needs guarding
 * here is public meaning, not layout: the correction-handoff benefit, the
 * exact published price, the bounded AI-visibility claim, and the
 * metric-led performance wording, in both languages. Layout, class names and
 * card structure are deliberately not asserted.
 */

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');

function page(route: string): string {
  return readFileSync(path.join(appDir, route, 'page.tsx'), 'utf8');
}

function readApp(file: string): string {
  return readFileSync(path.join(appDir, file), 'utf8');
}

/**
 * The prose as one line, with the module's own comments removed, JSX
 * apostrophe entities decoded, and French no-break space entities collapsed
 * into ordinary whitespace. This asserts the sentence a visitor reads, not
 * the formatting Prettier is free to change.
 */
function readable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/\{' '\}/gu, ' ')
    .replaceAll('&apos;', "'")
    .replaceAll('&#160;', ' ')
    .replace(/\s+/gu, ' ');
}

/** Price separators are exact bytes: see compliance-copy.test.ts, trade-off 29. */
function priced(source: string): string {
  return source.replaceAll('&#160;', '\u00a0');
}

const home = page('');
const homeProse = readable(home);
const offer = page('offre');
const offerProse = readable(offer);
const layout = readApp('layout.tsx');

const commercialSources = [
  ['home', home],
  ['offer', offer],
] as const;

const APPROVED_LIMIT_FR =
  "Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux de conformité officiel et ne peut pas servir de base à une déclaration d'accessibilité.";
const APPROVED_LIMIT_EN =
  'This is a technical diagnostic, not an audit RGAA. It does not produce an official conformity rate and cannot serve as the basis for an accessibility statement.';

describe('both commercial pages', () => {
  it.each(commercialSources)('%s is bilingual', (_name, source) => {
    expect(/\blang="fr"/u.test(source)).toBe(true);
    expect(/\blang="en"/u.test(source)).toBe(true);
  });

  it.each(commercialSources)('%s publishes the one price in both spellings', (_name, source) => {
    expect(priced(source)).toContain('1\u00a0600\u00a0\u20ac HT');
    expect(priced(source)).toContain('EUR 1,600 excl. VAT');
  });

  it.each(commercialSources)('%s names the one monitored contact address', (_name, source) => {
    expect(source).toContain('contact@odysseusaudit.com');
  });

  it.each(commercialSources)(
    '%s keeps the AI-visibility section bounded to verifiable signals',
    (_name, source) => {
      expect(readable(source)).toContain('Signaux de visibilité dans les moteurs et assistants IA');
      expect(readable(source)).toContain('AI visibility signals in search engines and assistants');
      // The check exists; the prediction does not. Both halves are asserted
      // because dropping either one reintroduces an overclaim or an
      // undisclosed limitation.
      expect(readable(source)).toContain('ne prédit pas');
      expect(readable(source)).toContain('does not predict');
      expect(readable(source)).toContain('citera');
      expect(readable(source)).toContain('recommandera');
      expect(readable(source)).toContain('cite');
      expect(readable(source)).toContain('recommend');
    },
  );

  it.each(commercialSources)(
    '%s names the three performance metrics with the field-data qualifier',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).toContain('LCP');
      expect(prose).toContain('Chargement du contenu principal');
      expect(prose).toContain('Largest contentful paint');
      expect(prose).toContain('CLS');
      expect(prose).toContain('Stabilité visuelle');
      expect(prose).toContain('Cumulative layout shift');
      expect(prose).toContain('INP');
      // INP depends on real-user field data that many smaller sites do not
      // have; the availability qualifier must travel with the metric.
      expect(prose).toContain('lorsque des données terrain sont disponibles');
      expect(prose).toContain('when field data is available');
    },
  );

  it.each(commercialSources)(
    '%s keeps content coverage total and performance coverage sampled',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).toContain('explorée avec succès');
      expect(prose).toContain('successfully crawled');
      expect(prose).toContain('échantillon représentatif');
      expect(prose).toContain('representative sample');
    },
  );

  it.each(commercialSources)('%s keeps security headers as their own check', (_name, source) => {
    expect(readable(source)).toContain('en-têtes de sécurité');
    expect(readable(source)).toContain('security headers');
  });

  it.each(commercialSources)('%s retains none of the retired claims', (_name, source) => {
    const prose = readable(source);
    expect(prose).not.toContain('Premier affichage');
    expect(prose).not.toContain('First paint');
    expect(prose).not.toContain('deviner');
    expect(prose).not.toContain('passer votre page');
    expect(prose).not.toContain('guess, or skip');
    // The offer page must not explain the cold-outreach preview at all: a
    // general offer page does not describe an outreach asset, so an outreach
    // implementation change can never force a marketing rewrite here.
    expect(prose).not.toContain('Si vous avez reçu un aperçu');
    expect(prose).not.toContain('If you received a preview');
    expect(prose).not.toContain('aperçu');
    expect(prose).not.toContain('preview');
  });

  it.each(commercialSources)('%s uses no em or en dash', (_name, source) => {
    expect(source).not.toMatch(/[\u2013\u2014]/u);
  });
});

describe('home page', () => {
  it('leads with the correction handoff, not scanner mechanics', () => {
    expect(homeProse).toContain('quoi corriger');
    expect(homeProse).toContain('what to fix');
  });

  it('states the limitation concisely and sends the reader to the offer for the full wording', () => {
    expect(homeProse).toContain('Ceci est un diagnostic technique, pas un audit RGAA.');
    expect(homeProse).not.toContain(APPROVED_LIMIT_FR);
    expect(home).toContain('href="/offre"');
  });

  it('has one primary write-to-us action rather than an order commitment', () => {
    expect(home).toContain('Écrire à Odysseus');
    expect(home).toContain('Write to Odysseus');
    expect(home).not.toContain('Commander');
    expect(home).not.toContain('Order');
  });
});

describe('offer page', () => {
  it('carries the approved limitation verbatim before its scope', () => {
    expect(offerProse).toContain(APPROVED_LIMIT_FR);
    expect(offerProse).toContain(APPROVED_LIMIT_EN);
  });

  it('states the price does not vary, because a prospect will ask', () => {
    expect(offerProse).toContain('ne dépend ni de la taille du site');
    expect(offerProse).toContain('does not depend on the size of the site');
  });

  it('keeps the no-legal-conclusion discipline', () => {
    expect(offerProse).toContain('sans conclure');
    expect(offerProse).toContain('without concluding');
  });

  it('uses one contact action that describes the actual act', () => {
    expect(offer).toContain('Écrire à Odysseus');
    expect(offer).toContain('Write to Odysseus');
    expect(offer).not.toContain('Commander');
    expect(offer).not.toContain('Order');
  });
});

describe('root metadata', () => {
  it('describes the full accurate scope, including the bounded AI signals', () => {
    expect(layout).toContain('signaux de visibilité IA');
    expect(layout).not.toContain('Premier affichage');
    expect(layout).not.toMatch(/[\u2013\u2014]/u);
  });
});
