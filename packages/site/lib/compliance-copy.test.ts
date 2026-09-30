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
const terms = prose(page('cgv'));
const legal = prose(page('mentions-legales'));

const rawSources = [
  'confidentialite-prospection',
  'desinscription',
  'bot',
  'offre',
  'exemple-audit',
  'cgv',
  'mentions-legales',
];

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
      ['Hostinger', 'Scaleway', 'Vercel', 'MongoDB Atlas', 'OpenAI', 'eu-west-3', 'Paris'],
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

  // The next-steps list may say, in passing, that a contacted prospect's
  // preview came from the complete analysis (2026-09-21, operator choice);
  // the page still never describes what the preview contains.
  it('does not explain the outreach preview on the commercial offer page', () => {
    expect(offer).not.toContain('Si vous avez reçu un aperçu');
    expect(offer).not.toContain('If you received a preview');
    expect(offer.match(/aperçu/gu) ?? []).toHaveLength(1);
    expect(offer.match(/preview/gu) ?? []).toHaveLength(1);
    expect(offer).not.toContain('trois pages');
    expect(offer).not.toContain('three pages');
  });

  it('states no obligation verdict', () => {
    expect(offer).toContain('ne se prononce pas sur vos obligations juridiques');
    expect(offer).toContain('does not determine your legal obligations');
    expect(offer).not.toMatch(/vous êtes tenu|you are required|vous devez/u);
  });
});

describe('terms of sale page', () => {
  it('is bilingual and says the French text is the binding one', () => {
    expect(isBilingual(terms)).toBe(true);
    expect(terms).toContain('Seule la version française');
    expect(terms).toContain('only the French version is legally binding');
  });

  it('identifies the provider as a sole trader with its registration number', () => {
    for (const fact of [
      'Jules Fontaine',
      'entrepreneur individuel (EI)',
      '980&#160;766&#160;463',
    ]) {
      expect(terms).toContain(fact);
    }
    expect(terms).toContain('SIREN: 980 766 463');
  });

  // Operator decision 2026-09-30: one five-business-day lead time for both
  // services, published on the offer page too.
  it('promises the same five-business-day lead time as the offer page', () => {
    expect(terms).toContain('sont remis sous cinq jours ouvrés');
    expect(terms).toContain('delivered within five business days');
    expect(offer).toContain('sous cinq jours ouvrés après votre paiement');
    expect(offer).toContain('within five business days of payment');
  });

  it('is reserved to business clients', () => {
    expect(terms).toContain('réservées aux professionnels');
    expect(terms).toContain('businesses only');
  });

  // Article L. 441-10 of the code de commerce: the payment conditions must
  // state the late-payment rate and the fixed recovery fee.
  it('states the statutory late-payment terms', () => {
    expect(terms).toContain('majoré de 10 points');
    expect(terms).toContain('40&#160;€ par facture');
    expect(terms).toContain('plus 10 percentage points');
    expect(terms).toContain('EUR 40 per invoice');
  });

  it('repeats the approved diagnostic limit and gives no legal verdict', () => {
    expect(terms).toContain('Ceci est un diagnostic technique, pas un audit RGAA.');
    expect(terms).toContain('This is a technical diagnostic, not an RGAA audit.');
    expect(terms).toContain('ne se prononce pas sur vos obligations juridiques');
    expect(terms).toContain('does not determine your legal obligations');
  });

  // Article 48 of the code de procédure civile voids a jurisdiction clause
  // unless every party contracted as a commerçant, which the operator is not.
  it('names no court by place', () => {
    expect(terms).not.toMatch(
      /tribunal (?:de commerce|judiciaire) de|attribution de juridiction/iu,
    );
    expect(terms).not.toMatch(/courts? of [A-Z]/u);
  });

  // The franchise-en-base article moves from the CGI to the CIBS on
  // 1 January 2027; quotes and invoices carry the mention in force.
  it('cites no VAT exemption article that is about to be renumbered', () => {
    expect(terms).not.toMatch(/293 B|CIBS/u);
  });

  it('acknowledges the small-business off-premises withdrawal right instead of excluding it', () => {
    expect(terms).toContain('L.&#160;221-3');
    expect(terms).toContain('fourteen-day withdrawal right');
  });

  it('describes what the model receives without claiming it sees nothing from the site', () => {
    expect(terms).toContain('OpenAI');
    expect(terms).toContain('courts extraits de code');
    expect(terms).toContain('short code excerpts');
    expect(terms).toContain('ne reçoit jamais le code HTML complet');
  });
});

describe('legal notice page', () => {
  it('is bilingual', () => {
    expect(isBilingual(legal)).toBe(true);
  });

  // LCEN article 1-1: a natural person publishing professionally names
  // themself, an address, the registration number, the publication director
  // and the host with its address and phone.
  it.each([
    ['the publisher', ['Jules Fontaine', 'entrepreneur individuel (EI)']],
    ['the registered address', ['71 ter, allée du Haurat, 33470 Gujan-Mestras']],
    ['the registration number', ['980&#160;766&#160;463', 'SIREN: 980 766 463']],
    ['the publication director', ['Directeur de la publication', 'Publication director']],
    [
      'the host',
      ['Vercel Inc.', '440 N Barranca Avenue #4133, Covina, CA 91723', '+1 559 288 7060'],
    ],
  ])('states %s', (_name, required) => {
    for (const fact of required) expect(legal).toContain(fact);
  });

  // Vercel's request logs and the opt-out limiter's in-memory address are the
  // only visitor data the site itself handles.
  it('tells visitors about host logs and the opt-out limiter', () => {
    expect(legal).toContain('journaux techniques');
    expect(legal).toContain('technical logs');
    expect(legal).toContain('dix minutes');
    expect(legal).toContain('ten minutes');
  });

  it('is linked from the site footer', () => {
    const chrome = readFileSync(path.join(appDir, '..', 'lib', 'site-chrome.tsx'), 'utf8');
    expect(chrome).toContain('href="/mentions-legales"');
    expect(chrome).toContain('href="/cgv"');
  });
});

describe('every compliance page', () => {
  it.each([
    ['privacy', privacy],
    ['opt-out', optOut],
    ['bot', bot],
    ['offer', offer],
    ['terms', terms],
    ['legal notice', legal],
  ])('%s names one contact address, the outreach one', (_name, source) => {
    expect(source).toContain('contact@odysseusaudit.fr');
    expect(source).not.toContain('contact@odysseusaudit.com');
    expect(source).not.toContain('julesfontaine.com');
  });

  it.each(rawSources)('%s uses no em or en dash', (route) => {
    expect(page(route)).not.toMatch(/[\u2013\u2014]/u);
  });

  it('the example report viewer prints no em or en dash of its own', () => {
    const viewer = readFileSync(path.join(appDir, '..', 'lib', 'report-viewer.tsx'), 'utf8');
    expect(viewer).not.toMatch(/[\u2013\u2014]/u);
  });
});
