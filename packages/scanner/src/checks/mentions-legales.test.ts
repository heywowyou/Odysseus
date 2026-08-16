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

  it('does not match a different legal page (cgu, privacy)', () => {
    expect(findMentionsLegalesUrl(['https://example.com/cgu', 'https://example.com/privacy'])).toBeNull();
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
});
