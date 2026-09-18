import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Meaning-level guards for the compliance and transparency pages. */

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');

function page(route: string): string {
  return readFileSync(path.join(appDir, route, 'page.tsx'), 'utf8');
}

function prose(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/\{' '\}/gu, ' ')
    .replace(/\s+/gu, ' ');
}

const privacy = prose(page('confidentialite-prospection'));
const optOut = prose(page('desinscription'));
const bot = prose(page('bot'));
const offer = prose(page('offre'));

const rawSources = ['confidentialite-prospection', 'desinscription', 'bot', 'offre'];

function isBilingual(source: string): boolean {
  return /\blang="en"/u.test(source);
}

describe('prospecting privacy page', () => {
  it('is bilingual', () => {
    expect(isBilingual(privacy)).toBe(true);
  });

  it.each([
    ['the controller', ['Jules Fontaine', 'contact@odysseusaudit.fr']],
    ['the exact sources', ['Atout France', 'data.gouv.fr', 'Sirene']],
    ['the legal basis', ['intérêt légitime', 'legitimate interest']],
    ['the retention period', ['90 jours', '90 days']],
    ['the objection route', ['/desinscription', 'CNIL']],
    [
      'the processors and where they hold the data',
      ['Scaleway', 'Vercel', 'MongoDB Atlas', 'eu-west-3', 'Paris'],
    ],
  ])('states %s', (_name, required) => {
    for (const fact of required) expect(privacy).toContain(fact);
  });

  it('states the three-page initial analysis, the full-site analysis, and that no booking is made', () => {
    expect(privacy).toContain('trois pages');
    expect(privacy).toContain('three publicly available pages');
    expect(privacy).toContain('analyse complète du site');
    expect(privacy).toContain('full-site analysis');
    expect(privacy).toContain('n&apos;effectue de réservation');
    expect(privacy).toContain('makes a booking');
  });

  it('states that the sent preview is a summary without screenshots or page addresses', () => {
    expect(privacy).toContain('ni capture d&apos;écran, ni adresse de page');
    expect(privacy).toContain('no screenshots');
    expect(privacy).toContain('page addresses');
  });

  it('states that prospect lists are not bought and email addresses are not vendor-verified', () => {
    expect(privacy).toContain('Nous n&apos;achetons aucun fichier');
    expect(privacy).toContain('We do not buy outreach lists');
    expect(privacy).toContain('vérification d&apos;adresses e-mail');
    expect(privacy).toContain('email verification services');
  });

  it('describes suppression fingerprints without claiming they are irreversible', () => {
    expect(privacy).toContain('ne conserve pas ces valeurs en clair');
    expect(privacy).toContain('does not store those values in plain text');
    expect(privacy).not.toContain('ne permet pas de retrouver');
    expect(privacy).not.toContain('cannot be turned back');
  });
});

describe('opt-out page', () => {
  it('offers a one-click form that posts to the drop box', () => {
    expect(optOut).toContain('action="/desinscription/envoyer"');
    expect(optOut).toContain('name="email"');
    expect(optOut).not.toContain('aucune demande n&apos;est transmise');
    expect(optOut).not.toContain('does not submit anything automatically');
  });

  it('is bilingual and offers a free mailto route', () => {
    expect(isBilingual(optOut)).toBe(true);
    expect(optOut).toContain('mailto:contact@odysseusaudit.fr');
    expect(optOut).toContain('gratuitement');
    expect(optOut).toContain('free of charge');
  });

  it('promises preview withdrawal and permanent, hash-only suppression', () => {
    expect(optOut).toContain('empreintes cryptographiques');
    expect(optOut).toContain('cryptographic fingerprints');
    expect(optOut).toContain('liste d&apos;opposition permanente');
    expect(optOut).toContain('permanent suppression list');
  });

  it('does not claim a suppression fingerprint cannot be reconstructed', () => {
    expect(optOut).not.toContain('pas de reconstituer votre adresse');
    expect(optOut).not.toContain('cannot be turned back into your address');
  });

  it('states that the form submits the request and is processed automatically', () => {
    expect(optOut).toContain('traitée automatiquement dans la minute');
    expect(optOut).toContain('processed automatically within a minute');
  });
});

describe('bot page', () => {
  it('is bilingual and keeps the robots and pacing language', () => {
    expect(isBilingual(bot)).toBe(true);
    expect(bot).toContain('User-agent: OdysseusBot');
    expect(bot).toContain('Crawl-delay');
    expect(bot).toContain('au moins 333 ms');
    expect(bot).toContain('at least 333 ms');
    expect(bot).toContain('sous-ressources');
    expect(bot).toContain('Subresources');
  });

  it('distinguishes commissioned diagnostics from outreach analysis', () => {
    expect(bot).toContain('Diagnostic commandé');
    expect(bot).toContain('Commissioned diagnostic');
    expect(bot).toContain('Analyse de prospection');
    expect(bot).toContain('Outreach analysis');
    expect(bot).toContain('nombre restreint');
    expect(bot).toContain('small number');
  });

  it('does not claim Lighthouse runs during the initial outreach analysis', () => {
    expect(bot).toContain('n&apos;exécute pas Lighthouse');
    expect(bot).toContain('does not run Lighthouse');
    const lighthouseClaims = bot.match(/Lighthouse/gu) ?? [];
    expect(lighthouseClaims.length).toBe(4);
  });

  it('does not claim client-rendered content is necessarily invisible to search engines', () => {
    expect(bot).toContain('absents du HTML initial');
    expect(bot).toContain('absent from the initial HTML');
    expect(bot).not.toContain('invisibles aux moteurs de recherche');
    expect(bot).not.toContain('invisible to search engines');
  });

  it('points at the prospecting privacy and opt-out pages', () => {
    expect(bot).toContain('/confidentialite-prospection');
    expect(bot).toContain('/desinscription');
  });
});

describe('offer page', () => {
  it('is bilingual and exists, because the preview contract requires the link', () => {
    expect(isBilingual(offer)).toBe(true);
  });

  it('publishes the one price, matching what the preview quotes', () => {
    expect(page('offre').replaceAll('&#160;', '\u00a0')).toContain('990\u00a0\u20ac HT');
    expect(page('offre')).toContain('EUR 990 excl. VAT');
  });

  it('says the price does not vary, because a prospect will ask', () => {
    expect(offer).toContain('ne dépend ni de la taille du site');
    expect(offer).toContain('does not depend on the size of the site');
  });

  it('does not explain the outreach preview on the commercial offer page', () => {
    expect(offer).not.toContain('Si vous avez reçu un aperçu');
    expect(offer).not.toContain('If you received a preview');
    expect(offer).not.toContain('aperçu');
    expect(offer).not.toContain('preview');
    expect(offer).not.toContain('trois pages');
    expect(offer).not.toContain('three pages');
  });

  it('states no obligation verdict', () => {
    expect(offer).toContain('ne se prononce pas sur vos obligations juridiques');
    expect(offer).toContain('does not determine your legal obligations');
    expect(offer).not.toMatch(/vous êtes tenu|you are required|vous devez/u);
  });
});

describe('every compliance page', () => {
  it.each([
    ['privacy', privacy],
    ['opt-out', optOut],
    ['bot', bot],
    ['offer', offer],
  ])('%s names one contact address, the outreach one', (_name, source) => {
    expect(source).toContain('contact@odysseusaudit.fr');
    expect(source).not.toContain('contact@odysseusaudit.com');
    expect(source).not.toContain('julesfontaine.com');
  });

  it.each(rawSources)('%s uses no em or en dash', (route) => {
    expect(page(route)).not.toMatch(/[\u2013\u2014]/u);
  });
});
