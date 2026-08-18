import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { renderNextSteps } from './next-steps.js';
import { getStrings } from '../strings/i18n.js';
import { ODYSSEUS_CONTACT_EMAIL } from '../html-utils.js';

function fakeManifest(): AuditManifest {
  return {
    auditId: 'a1b2c3',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-17T00:00:00.000Z',
    finishedAt: '2026-08-17T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.5.2',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {} as AuditManifest['config'],
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 3,
      robotsTxtFound: false,
      effectiveDelayMs: 500,
    },
    pages: [],
  };
}

// item 30 [REGRESSION]: the final page said requests could go "directement
// à l'équipe Odysseus" with no stated address - flagged once already on
// the haaitza pass and recurred.
describe('item 30: the contact page states a real, reachable contact address', () => {
  it('renders the code-owned contact email, not a vague pointer', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain(ODYSSEUS_CONTACT_EMAIL);
  });

  it('renders the same email in English', () => {
    const html = renderNextSteps(getStrings('en'), 14, fakeManifest(), 'en');
    expect(html).toContain(ODYSSEUS_CONTACT_EMAIL);
  });
});

// item 31: no authorship, terms, or liability block anywhere in a paid
// deliverable that may be forwarded to counsel.
describe('item 31: authorship and liability block', () => {
  it('states the producer, generation date, tool version, and report ID', () => {
    const manifest = fakeManifest();
    const html = renderNextSteps(getStrings('fr'), 14, manifest, 'fr');
    expect(html).toContain('Odysseus');
    expect(html).toContain('0.5.2');
    expect(html).toContain('a1b2c3');
  });

  it('states a limitation-of-liability sentence consistent with "report, don\'t conclude"', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain('ne saurait être tenu responsable');
    expect(html).toContain('Ce rapport');
  });
});

// item 3.13: no issuer identity (legal entity, signatory, SIRET) anywhere
// in the document - a professionalism and liability-exposure gap for a
// paid French deliverable.
describe('item 3.13: issuer identity block', () => {
  it('states a signatory and a visibly-incomplete SIRET placeholder, never a plausible fake number', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain('Jules Fontaine');
    expect(html).toContain('SIRET');
    expect(html).toContain('à renseigner');
  });
});

// item 3.12: the re-audit card described the offer with no price, no lead
// time, and no way to order it.
describe('item 3.12: re-audit pricing and lead time', () => {
  it('states an indicative price, a lead time, and the contact email to request one', () => {
    const html = renderNextSteps(getStrings('fr'), 14, fakeManifest(), 'fr');
    expect(html).toContain('450');
    expect(html).toContain('5 jours ouvrés');
    expect(html).toContain(ODYSSEUS_CONTACT_EMAIL);
  });
});
