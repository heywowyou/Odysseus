import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeJsonForScript, organizationJsonLd, websiteJsonLd } from './structured-data';

const libDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(libDir, '..', 'app');

function readApp(file: string): string {
  return readFileSync(path.join(appDir, file), 'utf8');
}

describe('organizationJsonLd (issue #213 item 4)', () => {
  it('describes Odysseus, never the hotel vertical the report targets', () => {
    const data = organizationJsonLd();
    expect(data['@type']).toBe('Organization');
    expect(data['@type']).not.toBe('LodgingBusiness');
    expect(data.name).toBe('Odysseus');
  });

  it('points at the canonical site URL', () => {
    const data = organizationJsonLd();
    expect(data.url).toBe('https://www.odysseusaudit.com');
  });

  it('carries no legal-identity fields until issue #213 item 1 supplies verified data', () => {
    const data = organizationJsonLd();
    expect(data).not.toHaveProperty('taxID');
    expect(data).not.toHaveProperty('vatID');
    expect(data).not.toHaveProperty('address');
  });
});

describe('websiteJsonLd (issue #213 item 4)', () => {
  it('is a WebSite, not a LodgingBusiness or other client-report type', () => {
    const data = websiteJsonLd();
    expect(data['@type']).toBe('WebSite');
    expect(data.url).toBe('https://www.odysseusaudit.com');
    expect(data.inLanguage).toEqual(['fr', 'en']);
  });
});

describe('structured data matches text already visible on the page', () => {
  it('uses the same site name and canonical URL as the root layout metadata', () => {
    const layout = readApp('layout.tsx');
    const data = organizationJsonLd();
    expect(layout).toContain(String(data.url));
    expect(layout).toContain(`siteName: '${String(data.name)}'`);
  });
});

describe('escapeJsonForScript', () => {
  it('escapes a literal "<" so the payload cannot close the surrounding script tag', () => {
    const escaped = escapeJsonForScript({ value: '</script><script>alert(1)</script>' });
    expect(escaped).not.toContain('<');
    expect(escaped).toContain('\\u003c/script>');
  });

  it('still produces valid JSON once unescaped back', () => {
    const escaped = escapeJsonForScript({ a: 1, b: 'text' });
    const restored = JSON.parse(escaped.replace(/\\u003c/gu, '<')) as { a: number; b: string };
    expect(restored).toEqual({ a: 1, b: 'text' });
  });
});
