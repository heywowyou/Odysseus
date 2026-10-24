import { describe, expect, it } from 'vitest';
import {
  extractMentionsLegales,
  findMentionsLegalesUrl,
  findMentionsLegalesUrls,
} from './mentions-legales.js';

describe('findMentionsLegalesUrl', () => {
  it('finds a URL matching the mentions-legales pattern', () => {
    const urls = [
      'https://example.com/',
      'https://example.com/mentions-legales',
      'https://example.com/contact',
    ];
    expect(findMentionsLegalesUrl(urls)).toBe('https://example.com/mentions-legales');
  });

  it('prefers a direct legal notice to sale conditions regardless of crawl order', () => {
    const urls = [
      'https://example.com/conditions-generales-de-vente',
      'https://example.com/mentions-legales',
      'https://example.com/informations-legales',
    ];
    expect(findMentionsLegalesUrl(urls)).toBe('https://example.com/mentions-legales');
    expect(findMentionsLegalesUrls(urls)).toEqual([
      'https://example.com/mentions-legales',
      'https://example.com/informations-legales',
      'https://example.com/conditions-generales-de-vente',
    ]);
  });

  it('matches the pathname instead of legal-looking hostnames', () => {
    expect(findMentionsLegalesUrl(['https://mentions-legales.example.com/contact'])).toBeNull();
  });

  it('returns null when no page matches', () => {
    expect(
      findMentionsLegalesUrl(['https://example.com/', 'https://example.com/contact']),
    ).toBeNull();
  });

  // item 0.6 (La Corniche pass): a live site put its SIREN on
  // /conditions-generales-dutilisation/, which the plural/singular
  // mentions-legales pattern alone never found - broadened to the other
  // page families that commonly carry the LCEN block. Still deliberately
  // narrower than the shared LEGAL_PATH_PATTERN: a cookie-consent or
  // privacy page almost never carries a SIREN, and matching one risks
  // findMentionsLegalesUrl locking onto the wrong page.
  it('matches the CGU, CGV, and conditions-generales page families', () => {
    expect(findMentionsLegalesUrl(['https://example.com/', 'https://example.com/cgu'])).toBe(
      'https://example.com/cgu',
    );
    expect(findMentionsLegalesUrl(['https://example.com/', 'https://example.com/cgv/'])).toBe(
      'https://example.com/cgv/',
    );
    expect(
      findMentionsLegalesUrl([
        'https://example.com/',
        'https://example.com/conditions-generales-dutilisation/',
      ]),
    ).toBe('https://example.com/conditions-generales-dutilisation/');
  });

  it('does not match an unrelated legal page (privacy, cookies)', () => {
    expect(
      findMentionsLegalesUrl(['https://example.com/privacy', 'https://example.com/cookies']),
    ).toBeNull();
  });

  it('matches the singular "mention-legale" variant', () => {
    expect(
      findMentionsLegalesUrl(['https://example.com/', 'https://example.com/mention-legale/']),
    ).toBe('https://example.com/mention-legale/');
  });

  // Issue #44 (Villas Foch): the site publishes its SIREN on
  // /fr/mentions-et-credits and /en/legals-and-credits. Neither path
  // matched the old pattern, so the extractor never ran and the report
  // asserted the site publishes no SIREN at all.
  it('matches the "mentions ... credits" compound the Villas Foch case uses', () => {
    const urls = ['https://example.com/', 'https://example.com/fr/mentions-et-credits'];
    expect(findMentionsLegalesUrl(urls)).toBe('https://example.com/fr/mentions-et-credits');
  });

  it('matches the English "legals" and "legal-notice" page families', () => {
    expect(findMentionsLegalesUrl(['https://example.com/en/legals-and-credits'])).toBe(
      'https://example.com/en/legals-and-credits',
    );
    expect(findMentionsLegalesUrl(['https://example.com/en/legal-notice'])).toBe(
      'https://example.com/en/legal-notice',
    );
  });

  it('matches the other "mentions" compounds and informations-legales', () => {
    expect(findMentionsLegalesUrl(['https://example.com/mentions-informations'])).toBe(
      'https://example.com/mentions-informations',
    );
    expect(findMentionsLegalesUrl(['https://example.com/informations-legales'])).toBe(
      'https://example.com/informations-legales',
    );
    expect(findMentionsLegalesUrl(['https://example.com/mentions-credits'])).toBe(
      'https://example.com/mentions-credits',
    );
  });

  it('still does not match a bare "legal" page or a privacy/cookies page', () => {
    // Bare "legal" stays excluded on purpose: it is the same wrong-lock
    // risk LEGAL_PATH_PATTERN's own narrowing warns about, and the issue
    // only names "legals" and "legal-notice" as the English forms.
    expect(findMentionsLegalesUrl(['https://example.com/legal'])).toBeNull();
    expect(
      findMentionsLegalesUrl(['https://example.com/privacy', 'https://example.com/cookies']),
    ).toBeNull();
    expect(findMentionsLegalesUrl(['https://example.com/terms'])).toBeNull();
  });
});

describe('extractMentionsLegales', () => {
  const pageUrl = 'https://example.com/mentions-legales';

  it('extracts a valid SIREN, RCS, and TVA from a clean page', () => {
    const bodyText = `
      SIREN : 732 829 320
      RCS Paris 732 829 320
      TVA intracommunautaire : FR 12 732829320
    `;
    const result = extractMentionsLegales(pageUrl, bodyText);
    expect(result.siren).toBe('732829320');
    expect(result.rcs).toBe('Paris 732829320');
    expect(result.tva).toBe('FR12732829320');
  });

  it('extracts a SIREN-only page', () => {
    const result = extractMentionsLegales(pageUrl, 'SIREN : 732829320');
    expect(result.siren).toBe('732829320');
    expect(result.rcs).toBeUndefined();
    expect(result.tva).toBeUndefined();
  });

  it('rejects a malformed-checksum SIREN', () => {
    const result = extractMentionsLegales(pageUrl, 'SIREN : 732829321');
    expect(result.siren).toBeUndefined();
  });

  it('derives a valid SIREN from a fused 14-digit SIRET', () => {
    const result = extractMentionsLegales(pageUrl, 'RCS/RM/Siret : 95126636000019');
    expect(result.siren).toBe('951266360');
  });

  it('finds nothing on a page with none of the three identifiers', () => {
    const result = extractMentionsLegales(pageUrl, 'Contactez-nous pour en savoir plus.');
    expect(result.siren).toBeUndefined();
    expect(result.rcs).toBeUndefined();
    expect(result.tva).toBeUndefined();
  });

  // item 0.1/0.6 (La Corniche pass): a real CGU page stated the
  // operator's own SIRET next to its own address, but also carried a web
  // agency's RCS/SIREN elsewhere as boilerplate (a different city, a
  // different address) - both 9-digit and Luhn-valid. The bare SIREN
  // pattern matched the agency's number first, before this fix, because
  // it appeared earlier in body-text order and with no fused digits to
  // disqualify it as a simple SIREN_CANDIDATE_PATTERN match.
  it('prefers a SIRET-embedded SIREN over a bare SIREN appearing earlier in the text (real La Corniche case)', () => {
    const bodyText = `
      Cette prestation est fournie par notre agence, inscrite au registre
      du commerce et des sociétés de Montpellier sous le numéro 443 748 397
      00041, dont le siège social est situé Zone Ecoparc, 34130 Saint-Aunès.

      Buch - France
      SIRET : 79085257800018
      N° de TVA Intracommunautaire : FR20790852578
    `;
    const result = extractMentionsLegales(pageUrl, bodyText);
    expect(result.siren).toBe('790852578');
    expect(result.siren).not.toBe('443748397');
  });

  // Issue #76 (Hotel Tandem, audit dcf21a89-824f-4a07-9c3e-2fb08638fe55): a
  // page with distinct "EDITEUR" and "Hebergement" sections put the web
  // host's (O2Switch) SIRET before the site editor's (HOTELIFE) SIREN in
  // document order. The old first-match-in-document-order scan returned
  // the host's number, which then fed into assessObligations() as the
  // audited company's own legal identity.
  it('prefers the SIREN under an EDITEUR section over one under a Hebergement section (real Hotel Tandem case)', () => {
    const bodyText = `
      EDITEUR
      SASU HOTELIFE, RCS Colmar, SIREN 835138645

      Hebergement
      O2 Switch, SIRET 510 909 807 00032, RCS Clermont-Ferrand
    `;
    const result = extractMentionsLegales(pageUrl, bodyText);
    expect(result.siren).toBe('835138645');
    expect(result.siren).not.toBe('510909807');
  });

  it('still finds a SIREN that only appears under a Hebergement section', () => {
    const bodyText = `
      Hebergement
      O2 Switch, SIRET 510 909 807 00032, RCS Clermont-Ferrand
    `;
    const result = extractMentionsLegales(pageUrl, bodyText);
    expect(result.siren).toBe('510909807');
  });

  it('does not treat "hebergement" used as ordinary hotel-lodging text as a section header', () => {
    // The word "hebergement" (lodging) is extremely common on the hotel
    // sites this product audits, in the ordinary sense of accommodation,
    // not as a legal web-hosting disclosure label - it must not be
    // mistaken for one just because it appears mid-sentence.
    const bodyText = `
      Notre hebergement propose des chambres tout confort a partir de 89 euros.

      EDITEUR
      SASU HOTELIFE, RCS Colmar, SIREN 835138645
    `;
    const result = extractMentionsLegales(pageUrl, bodyText);
    expect(result.siren).toBe('835138645');
  });
});

describe('legal-notice slugs (issue #496)', () => {
  it('finds underscore, joined, accented and bare "mentions" slugs', () => {
    for (const path of [
      '/mentions_legales',
      '/mentionslegales',
      '/mentions-l%C3%A9gales',
      '/fr/mentions-légales/',
      '/mentions',
    ]) {
      expect(findMentionsLegalesUrl([`https://hotel.fr${path}`]), path).toBe(
        `https://hotel.fr${path}`,
      );
    }
  });

  // A hand-built PHP site names its legal notice /mentions.php: the bare
  // family accepted only .html, so the check read the homepage and reported
  // no identifier although the notice prints the SIRET.
  it('finds a bare "mentions" page whatever its file extension', () => {
    for (const path of ['/mentions.php', '/en/mentions.php', '/mentions.aspx', '/mentions.htm']) {
      expect(findMentionsLegalesUrl([`https://hotel.fr${path}`]), path).toBe(
        `https://hotel.fr${path}`,
      );
    }
    expect(findMentionsLegalesUrl(['https://hotel.fr/mentions.presse/dossier'])).toBe(null);
  });

  // A hotel CMS names the page that carries the RCS and VAT numbers
  // "conditions d'utilisation": the terms family knew only the "générales"
  // spelling and the CGU initials, so the homepage was read instead.
  it('finds terms of use spelled out', () => {
    for (const path of ['/fr/conditions-d-utilisation.html', '/conditions-utilisation']) {
      expect(findMentionsLegalesUrl([`https://hotel.fr${path}`]), path).toBe(
        `https://hotel.fr${path}`,
      );
    }
  });

  // A site kept an empty /mentions-legales page and printed its SIRET on
  // /m-legales: the abbreviation was no candidate, so the check read only
  // the empty page and reported no identifier.
  it('finds the abbreviated "m-legales" page', () => {
    for (const path of ['/fr/m-legales', '/m-legale', '/en/mlegales.html']) {
      expect(findMentionsLegalesUrl([`https://hotel.fr${path}`]), path).toBe(
        `https://hotel.fr${path}`,
      );
    }
    expect(findMentionsLegalesUrl(['https://hotel.fr/salle-m-legales-2'])).toBe(null);
    expect(
      findMentionsLegalesUrls([
        'https://hotel.fr/fr/m-legales',
        'https://hotel.fr/fr/mentions-legales',
      ]),
    ).toEqual(['https://hotel.fr/fr/mentions-legales', 'https://hotel.fr/fr/m-legales']);
  });

  it('still does not lock onto a bare "legal" page', () => {
    expect(findMentionsLegalesUrl(['https://hotel.fr/legal', 'https://hotel.fr/fr/legal'])).toBe(
      null,
    );
  });

  it('ranks a real legal notice above terms of sale and a bare "mentions" page', () => {
    expect(
      findMentionsLegalesUrls([
        'https://hotel.fr/cgv',
        'https://hotel.fr/fr/mentions',
        'https://hotel.fr/mentions-legales',
      ]),
    ).toEqual([
      'https://hotel.fr/mentions-legales',
      'https://hotel.fr/fr/mentions',
      'https://hotel.fr/cgv',
    ]);
  });
});
