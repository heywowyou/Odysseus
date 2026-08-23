import { describe, expect, it } from 'vitest';
import { isNonHtmlContentType, isSameSiteHostname } from './crawl.js';

describe('isNonHtmlContentType', () => {
  it('treats a missing Content-Type as HTML', () => {
    expect(isNonHtmlContentType(undefined)).toBe(false);
  });

  it('treats text/html, including with a charset, as HTML', () => {
    expect(isNonHtmlContentType('text/html')).toBe(false);
    expect(isNonHtmlContentType('text/html; charset=utf-8')).toBe(false);
  });

  it('flags an image Content-Type as non-HTML', () => {
    expect(isNonHtmlContentType('image/jpeg')).toBe(true);
  });

  it('flags a PDF Content-Type as non-HTML', () => {
    expect(isNonHtmlContentType('application/pdf')).toBe(true);
  });
});

describe('isSameSiteHostname', () => {
  it('treats an exact hostname match as the same site', () => {
    expect(isSameSiteHostname('lacoorniche.com', 'lacoorniche.com')).toBe(true);
  });

  it('treats a www prefix difference either direction as the same site', () => {
    expect(isSameSiteHostname('www.lacoorniche.com', 'lacoorniche.com')).toBe(true);
    expect(isSameSiteHostname('lacoorniche.com', 'www.lacoorniche.com')).toBe(true);
  });

  it('rejects a genuinely different domain, even one that shares a substring', () => {
    // Real case: haaitza.com/carte-cadeaux forwards to a third-party
    // booking platform on a completely different domain.
    expect(isSameSiteHostname('haaitza.com', 'haaitza-lacoorniche.diadabox.fr')).toBe(false);
  });

  it('rejects a social platform landing', () => {
    expect(isSameSiteHostname('client.example', 'facebook.com')).toBe(false);
  });

  it('rejects a subdomain that is not a www prefix', () => {
    expect(isSameSiteHostname('client.example', 'shop.client.example')).toBe(false);
  });
});
