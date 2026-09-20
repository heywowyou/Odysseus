import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Meaning-level guardrails for the two commercial pages. These tests protect
 * the bounded product claims and the native public vocabulary, not layout.
 */

const libDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(libDir, '..', 'app');

function page(route: string): string {
  return readFileSync(path.join(appDir, route, 'page.tsx'), 'utf8');
}

function readApp(file: string): string {
  return readFileSync(path.join(appDir, file), 'utf8');
}

function readLib(file: string): string {
  return readFileSync(path.join(libDir, file), 'utf8');
}

function readable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/\{' '\}/gu, ' ')
    .replaceAll('&apos;', "'")
    .replaceAll('&#160;', ' ')
    .replace(/\s+/gu, ' ');
}

function priced(source: string): string {
  return source.replaceAll('&#160;', '\u00a0');
}

const home = page('');
const homeProse = readable(home);
const offer = page('offre');
const offerProse = readable(offer);
const layout = readApp('layout.tsx');
const siteChrome = readLib('site-chrome.tsx');
const pageMeta = readLib('page-meta.ts');

const commercialSources = [
  ['home', home],
  ['offer', offer],
] as const;

const APPROVED_LIMIT_FR =
  "Ceci est un diagnostic technique, pas un audit RGAA. Il ne produit pas de taux de conformité officiel et ne peut pas servir de base à une déclaration d'accessibilité.";
const APPROVED_LIMIT_EN =
  'This is a technical diagnostic, not an RGAA audit. It does not produce an official conformity rate and cannot serve as the basis for an accessibility statement.';

describe('both commercial pages', () => {
  it.each(commercialSources)('%s is bilingual', (_name, source) => {
    expect(/\blang="fr"/u.test(source)).toBe(true);
    expect(/\blang="en"/u.test(source)).toBe(true);
  });

  it.each(commercialSources)('%s publishes the fixed price in both spellings', (_name, source) => {
    expect(priced(source)).toContain('990\u00a0\u20ac HT');
    expect(priced(source)).toContain('EUR 990 excl. VAT');
  });

  it.each(commercialSources)(
    '%s names the canonical monitored contact address',
    (_name, source) => {
      expect(source).toContain('contact@odysseusaudit.fr');
    },
  );

  it.each(commercialSources)(
    '%s keeps AI-assistant claims bounded to verifiable technical signals',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).toContain('Signaux techniques liés aux assistants IA');
      expect(prose).toContain('Technical signals for AI assistants');
      expect(prose).toContain('ne prédit pas');
      expect(prose).toContain('does not predict');
      expect(prose).toContain('citera');
      expect(prose).toContain('recommandera');
      expect(prose).toContain('cite');
      expect(prose).toContain('recommend');
    },
  );

  it.each(commercialSources)(
    '%s describes render comparison without claiming a search engine cannot render JavaScript',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).toContain('HTML');
      expect(prose).toContain('JavaScript');
      expect(prose).not.toContain("ce qu'un moteur de recherche reçoit réellement");
      expect(prose).not.toContain('what a search engine actually receives');
      expect(prose).not.toContain("le robot d'indexation ne l'a jamais reçu");
      expect(prose).not.toContain('the crawler never received it');
    },
  );

  it.each(commercialSources)(
    '%s describes accessibility as automatable or automated checks rather than full conformance testing',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).toMatch(/contrôles automatisables|automated accessibility/u);
      expect(prose).toMatch(/automatable checks|automated accessibility/u);
      expect(prose).not.toContain('conforme aux WCAG');
      expect(prose).not.toContain('WCAG compliant');
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
      expect(prose).toContain('lorsque des données terrain sont disponibles');
      expect(prose).toContain('when field data is available');
    },
  );

  it.each(commercialSources)(
    '%s keeps content coverage total and performance coverage sampled',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).toContain("page accessible à l'outil");
      expect(prose).toContain('page the tool can access');
      expect(prose).toContain('sélection');
      expect(prose).toContain('selection');
      expect(prose).not.toContain('échantillon représentatif');
      expect(prose).not.toContain('representative sample');
    },
  );

  it.each(commercialSources)(
    '%s names security headers instead of implying a security audit',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).toContain('en-têtes de sécurité');
      expect(prose).toContain('security headers');
    },
  );

  it.each(commercialSources)(
    '%s does not sell the report languages as a feature',
    (_name, source) => {
      const prose = readable(source);
      expect(prose).not.toContain('bilingue');
      expect(prose).not.toContain('bilingual');
      expect(prose).not.toContain('en français et en anglais');
      expect(prose).not.toContain('in French and English');
    },
  );

  it.each(commercialSources)('%s renders the shared dossier card', (_name, source) => {
    expect(source).toContain('<Dossier lang="fr" />');
    expect(source).toContain('<Dossier lang="en" />');
    expect(source).not.toContain('className="dossier"');
  });

  it.each(commercialSources)('%s uses no em or en dash', (_name, source) => {
    expect(source).not.toMatch(/[\u2013\u2014]/u);
  });
});

describe('canonical public vocabulary', () => {
  const frenchPublicCopy = [
    homeProse,
    offerProse,
    readable(layout),
    readable(siteChrome),
    readable(pageMeta),
  ].join(' ');

  it('uses diagnostic terminology rather than selling an audit', () => {
    expect(homeProse).toContain('diagnostic technique');
    expect(offerProse).toContain('diagnostic technique');
    expect(frenchPublicCopy).toContain('Le diagnostic');
  });

  it('positions the paid service as a diagnostic with recommendations', () => {
    expect(homeProse).toContain('diagnostic avec préconisations');
    expect(offerProse).toContain('préconisations');
    expect(frenchPublicCopy).toContain('avec préconisations');
  });

  it('uses the bounded AI-assistant category name throughout the public site', () => {
    expect(homeProse).toContain('Signaux techniques liés aux assistants IA');
    expect(offerProse).toContain('Signaux techniques liés aux assistants IA');
    expect(frenchPublicCopy).toContain('signaux techniques liés aux assistants IA');
    expect(frenchPublicCopy).not.toContain('visibilité dans les assistants IA');
  });

  it('uses initial-HTML and rendered-page vocabulary for search rendering', () => {
    expect(homeProse).toContain('HTML initial');
    expect(offerProse).toContain('HTML initial');
    expect(homeProse).toContain('rendu JavaScript');
    expect(offerProse).toContain('rendu JavaScript');
  });
});

describe('home page', () => {
  it('leads with the correction handoff', () => {
    expect(homeProse).toContain('Un diagnostic avec préconisations pour passer du constat à la solution');
    expect(homeProse).toContain('A diagnostic with recommendations, from findings to fixes');
  });

  it('states the RGAA limitation concisely and links to the full wording', () => {
    expect(homeProse).toContain('Ceci est un diagnostic technique, pas un audit RGAA.');
    expect(homeProse).not.toContain(APPROVED_LIMIT_FR);
    expect(home).toContain('href="/offre"');
  });

  it('uses a conversational contact action rather than an order commitment', () => {
    expect(home).toContain('Nous contacter');
    expect(home).toContain('Contact us');
    expect(home).not.toContain('Commander');
    expect(home).not.toContain('Order');
  });
});

describe('offer page', () => {
  it('carries the approved limitation before the detailed scope', () => {
    expect(offerProse).toContain(APPROVED_LIMIT_FR);
    expect(offerProse).toContain(APPROVED_LIMIT_EN);
  });

  it('states that the price does not vary with site size or findings', () => {
    expect(offerProse).toContain('ne dépend ni de la taille du site');
    expect(offerProse).toContain('does not depend on the size of the site');
  });

  it('keeps legal scope explicitly non-determinative', () => {
    expect(offerProse).toContain('ne se prononce pas sur vos obligations juridiques');
    expect(offerProse).toContain('does not determine your legal obligations');
  });

  it('uses a contact action that describes the actual act', () => {
    expect(offer).toContain('Nous contacter');
    expect(offer).toContain('Contact us');
    expect(offer).not.toContain('Commander');
    expect(offer).not.toContain('Order');
  });
});

describe('root metadata', () => {
  it('describes the bounded public scope', () => {
    expect(layout).toContain('rendu JavaScript');
    expect(layout).toContain('signaux techniques liés aux assistants IA');
    expect(layout).toContain('tarif fixe');
    expect(layout).not.toContain('visibilité dans les assistants IA');
    expect(layout).not.toMatch(/[\u2013\u2014]/u);
  });
});
