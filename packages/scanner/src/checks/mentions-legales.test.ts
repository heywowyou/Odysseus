import { describe, expect, it } from 'vitest';
import { extractMentionsLegales, findMentionsLegalesUrl } from './mentions-legales.js';

describe('findMentionsLegalesUrl', () => {
  it('finds a URL matching the mentions-legales pattern', () => {
    const urls = ['https://example.com/', 'https://example.com/mentions-legales', 'https://example.com/contact'];
    expect(findMentionsLegalesUrl(urls)).toBe('https://example.com/mentions-legales');
  });

  it('returns null when no page matches', () => {
    expect(findMentionsLegalesUrl(['https://example.com/', 'https://example.com/contact'])).toBeNull();
  });

  // item 0.6 (La Corniche pass): a live site put its SIREN on
  // /conditions-generales-dutilisation/, which the plural/singular
  // mentions-legales pattern alone never found - broadened to the other
  // page families that commonly carry the LCEN block. Still deliberately
  // narrower than the shared LEGAL_PATH_PATTERN: a cookie-consent or
  // privacy page almost never carries a SIREN, and matching one risks
  // findMentionsLegalesUrl locking onto the wrong page.
  it('matches the CGU, CGV, and conditions-generales page families', () => {
    expect(findMentionsLegalesUrl(['https://example.com/', 'https://example.com/cgu'])).toBe('https://example.com/cgu');
    expect(findMentionsLegalesUrl(['https://example.com/', 'https://example.com/cgv/'])).toBe('https://example.com/cgv/');
    expect(
      findMentionsLegalesUrl(['https://example.com/', 'https://example.com/conditions-generales-dutilisation/']),
    ).toBe('https://example.com/conditions-generales-dutilisation/');
  });

  it('does not match an unrelated legal page (privacy, cookies)', () => {
    expect(findMentionsLegalesUrl(['https://example.com/privacy', 'https://example.com/cookies'])).toBeNull();
  });

  it('matches the singular "mention-legale" variant', () => {
    expect(findMentionsLegalesUrl(['https://example.com/', 'https://example.com/mention-legale/'])).toBe(
      'https://example.com/mention-legale/',
    );
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
});
