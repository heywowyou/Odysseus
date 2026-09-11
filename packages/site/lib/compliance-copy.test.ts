import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The compliance pages, asserted as content rather than rendered.
 *
 * `packages/site` has no React testing setup and the workspace collects plain
 * `.ts` tests in a Node environment, so these read the page sources as text.
 * That is enough for what actually needs guarding: these are legal and
 * client-facing statements, and the failure worth catching is a required
 * disclosure disappearing or a corrected claim coming back, not a layout
 * regression.
 */

const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');

function page(route: string): string {
  return readFileSync(path.join(appDir, route, 'page.tsx'), 'utf8');
}

/**
 * The prose as one line, with the module's own comments removed.
 *
 * JSX wraps sentences across source lines, so "make no booking" is not a
 * substring of the file even though it is a substring of what the visitor
 * reads. Collapsing whitespace asserts the sentence rather than the formatting,
 * which Prettier is free to change. Comments are dropped because a docblock
 * explaining that a claim was removed would otherwise count as the claim.
 */
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

/**
 * Both language sections exist, so a fact asserted once is not silently
 * present in French only.
 *
 * Matched as a bare `lang="en"` attribute rather than a literal tag: since
 * 2026-09-10 the English content is wrapped in a `<LanguageSection lang="en">`
 * (`lib/language.tsx`), a real toggle rather than a jump link to content that
 * was already visible, so the element carrying the attribute is a plain
 * `<div>`, not necessarily a `<section>`. This asserts what the visitor
 * reads, not how the toggle is implemented.
 */
function isBilingual(source: string): boolean {
  return /\blang="en"/u.test(source);
}

describe('prospecting privacy page', () => {
  it('is bilingual', () => {
    expect(isBilingual(privacy)).toBe(true);
  });

  it.each([
    ['the controller', ['Jules Fontaine', 'contact@odysseusaudit.com']],
    // Article 14 requires the source, per prospect and accurately. Naming the
    // registers is the whole point; "public sources" would not be a disclosure.
    ['the exact sources', ['Atout France', 'data.gouv.fr', 'Sirene']],
    ['the legal basis', ['intérêt légitime', 'legitimate interest']],
    ['the retention period', ['quatre-vingt-dix jours', 'Ninety days']],
    ['the objection route', ['/desinscription', 'CNIL']],
    // Named with their regions, because "a provider in the EU" is not a
    // disclosure a reader can check and "AWS Paris (eu-west-3)" is.
    [
      'the processors and where they hold the data',
      ['Scaleway', 'Vercel', 'MongoDB Atlas', 'eu-west-3', 'Paris'],
    ],
  ])('states %s', (_name, required) => {
    for (const fact of required) expect(privacy).toContain(fact);
  });

  it('states the three-page first pass, discloses the full second pass, and that no booking is made', () => {
    // Plan 037: prospecting now has two passes. The cheap three-page prescan
    // keeps qualifying sites, and a small number of pre-selected establishments
    // receive a full-site outreach scan. Hiding the second pass would make the
    // page diverge from what a site owner sees in their own access logs.
    expect(privacy).toContain('trois pages');
    expect(privacy).toContain('three pages');
    expect(privacy).toContain('ensemble du site');
    expect(privacy).toContain('whole site');
    expect(privacy).toContain('n&apos;effectue de réservation');
    expect(privacy).toContain('makes a booking');
  });

  it('states that the sent preview shows totals only, never a screenshot or a page address', () => {
    expect(privacy).toContain('ni capture d&apos;écran, ni adresse de page');
    expect(privacy).toContain('no screenshot, no page address');
  });

  it('does not claim data is bought or verified by a vendor', () => {
    expect(privacy).toContain('Nous n&apos;achetons aucun fichier');
    expect(privacy).toContain('We buy no prospecting lists');
  });

  it('does not overstate what an unsalted suppression fingerprint protects', () => {
    expect(privacy).toContain('Cette liste ne conserve pas');
    expect(privacy).toContain('This list does not retain');
    expect(privacy).not.toContain('ne permet pas de retrouver');
    expect(privacy).not.toContain('cannot be turned back');
  });
});

describe('opt-out page', () => {
  it('is bilingual and offers a free mailto route', () => {
    expect(isBilingual(optOut)).toBe(true);
    expect(optOut).toContain('mailto:contact@odysseusaudit.com');
    expect(optOut).toContain('gratuit');
    expect(optOut).toContain('is free');
  });

  it('promises preview withdrawal and permanent, hash-only suppression', () => {
    expect(optOut).toContain('empreintes');
    expect(optOut).toContain('fingerprints');
    expect(optOut).toContain('permanente');
    expect(optOut).toContain('permanent objection list');
  });

  it('does not claim a suppression fingerprint cannot be reconstructed', () => {
    expect(optOut).not.toContain('pas de reconstituer votre adresse');
    expect(optOut).not.toContain('cannot be turned back into your address');
  });

  it('does not claim an automated one-click database action, because there is none', () => {
    // The suppression write is a private CLI command run by a person. A page
    // implying a button writes to the database would be a promise the system
    // does not keep.
    expect(optOut).toContain('lu par une personne');
    expect(optOut).toContain('A person reads the message');
    expect(optOut).not.toMatch(/<form/u);
    expect(optOut).not.toMatch(/automatiquement retiré/u);
  });
});

describe('bot page', () => {
  it('is bilingual and keeps the robots and pacing language', () => {
    expect(isBilingual(bot)).toBe(true);
    expect(bot).toContain('User-agent: OdysseusBot');
    expect(bot).toContain('Crawl-delay');
    expect(bot).toContain('1000');
  });

  it('distinguishes the commissioned audit from the prospecting passes', () => {
    expect(bot).toContain('Audit commandé');
    expect(bot).toContain('Commissioned audit');
    expect(bot).toContain('Analyse de prospection');
    expect(bot).toContain('Prospecting analysis');
    // Plan 037: the full-site outreach pass is disclosed, because a site owner
    // would see it in their access logs and the page must survive that check.
    expect(bot).toContain('nombre restreint');
    expect(bot).toContain('small number');
  });

  it('no longer claims Lighthouse runs during prospecting', () => {
    // The shipped prescan skips Lighthouse. This is the claim the page used to
    // make unconditionally, and the one a site owner could most easily check
    // against their own logs.
    expect(bot).toContain('sans Lighthouse');
    expect(bot).toContain('without Lighthouse');
    for (const source of [bot]) {
      const lighthouseClaims = source.match(/Lighthouse/gu) ?? [];
      // Twice per language: once for the audit, once saying prospecting has none.
      expect(lighthouseClaims.length).toBe(4);
    }
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
    // The raw source, not the normalized prose: the separators are U+00A0
    // (trade-off 29) and collapsing whitespace would turn them into ordinary
    // spaces, so this assertion would pass on the wrong bytes.
    // packages/core/src/offer/pricing.test.ts is what holds the figure to the
    // code-owned constant; this asserts only that the page did not lose it.
    expect(page('offre').replaceAll('&#160;', '\u00a0')).toContain('1\u00a0600\u00a0\u20ac HT');
    expect(page('offre')).toContain('EUR 1,600 excl. VAT');
  });

  it('says the price does not vary, because a prospect will ask', () => {
    expect(offer).toContain('ne dépend ni de la taille du site');
    expect(offer).toContain('does not depend on the size of the site');
  });

  it('no longer explains the outreach preview at all', () => {
    // Plan 038 removed the preview paragraph: a general offer page does not
    // describe a cold-outreach asset, so an outreach implementation change
    // can never force a marketing rewrite here. Plan 037 slice 1 (db6db08)
    // had pinned the interim whole-site-summary wording; plan 038 supersedes
    // that pin, and the preview's own contract lives in outreach-rules 6bis,
    // not on this page.
    expect(offer).not.toContain('Si vous avez reçu un aperçu');
    expect(offer).not.toContain('If you received a preview');
    expect(offer).not.toContain('aperçu');
    expect(offer).not.toContain('preview');
    expect(offer).not.toContain('trois pages');
    expect(offer).not.toContain('three pages');
  });

  it('states no obligation verdict', () => {
    // "We report, we do not conclude" binds every client-facing surface, not
    // only the report templates.
    expect(offer).toContain('sans conclure');
    expect(offer).toContain('without concluding');
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
    // One address across every surface a prospect can reach. Two would mean an
    // objection sent to whichever one the reader happened to see, and only one
    // of them is the mailbox this campaign monitors.
    expect(source).toContain('contact@odysseusaudit.com');
    expect(source).not.toContain('julesfontaine.com');
  });

  it.each(rawSources)('%s uses no em or en dash', (route) => {
    expect(page(route)).not.toMatch(/[\u2013\u2014]/u);
  });
});
