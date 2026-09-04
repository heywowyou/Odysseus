/**
 * Manual-input-layer milestone, rule 5: every manual field absent must
 * produce a correctly rendering report, and every field present must
 * actually render where it belongs. Plan 018 step 4 moves the legal name
 * off the cover entirely, so identity placement is asserted across both
 * the minimal cover and the metadata sheet.
 */
import { describe, expect, it } from 'vitest';
import type { PreparationPreviewLanguage } from '@odysseus/core';
import { hostnameFromSiteUrl, renderCover } from './cover.js';
import { renderMetadataSheet } from './metadata-sheet.js';
import { fr } from '../strings/fr.js';
import { en } from '../strings/en.js';
import { resolveGenericDecisionQuestion } from '../generic-question.js';
import { loadSmallSiteAnalysis, loadSmallSiteManifest } from '../../test-fixtures.js';

/** The cover section's own headline text, so precedence is asserted
 *  against the h1 itself rather than anywhere-else-in-the-page matches
 *  (the footer-source still carries the raw site URL, for instance). */
function coverHeadline(html: string): string {
  const match = /<h1[^>]*>([^<]*)<\/h1>/.exec(html);
  if (match?.[1] === undefined) throw new Error('cover renders no h1');
  return match[1];
}

describe('renderCover headline identity precedence (plan 018 step 4)', () => {
  it('falls back to the manifest hostname when nomCommercial is absent', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis);
    expect(hostnameFromSiteUrl(manifest.siteUrl)).toBe('small-site.test');
    expect(coverHeadline(html)).toBe('small-site.test');
    expect(html).not.toContain(fr.cover.recipientLabel);
  });

  it('renders nomCommercial as the headline when supplied, ahead of the hostname', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis, [], {
      nomCommercial: { value: 'Acme SAS', provenance: 'operator' },
      updatedAt: new Date(),
    });
    expect(coverHeadline(html)).toBe('Acme SAS');
  });

  it('falls back to the report title when the site URL does not even parse', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, { ...manifest, siteUrl: 'not-a-url' }, analysis);
    expect(hostnameFromSiteUrl('not-a-url')).toBeNull();
    expect(coverHeadline(html)).toBe('Rapport d&#39;audit');
  });

  it('renders the English report title fallback for an English report', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('en');
    const html = renderCover(en, { ...manifest, siteUrl: 'not-a-url' }, analysis);
    expect(coverHeadline(html)).toBe(en.cover.reportTitle);
  });
});

describe('legal-name placement (plan 018 step 4): metadata sheet only', () => {
  const manualFields = {
    nomCommercial: { value: 'Acme SAS', provenance: 'operator' as const },
    raisonSociale: {
      value: 'Acme Société par Actions Simplifiée',
      provenance: 'operator' as const,
    },
    updatedAt: new Date(),
  };

  it('the cover never renders the legal name or its label, even when supplied', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis, [], manualFields);
    expect(html).not.toContain('Acme Société par Actions Simplifiée');
    expect(html).not.toContain(fr.metadata.legalNameLabel);
  });

  it('the metadata sheet renders the legal-name row when the field is supplied', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(fr, manifest, analysis, [], manualFields);
    expect(html).toContain(fr.metadata.legalNameLabel);
    expect(html).toContain('Acme Société par Actions Simplifiée');
  });

  it('omits the legal-name row entirely when absent, in French and English', async () => {
    const manifest = await loadSmallSiteManifest();
    const frHtml = renderMetadataSheet(fr, manifest, await loadSmallSiteAnalysis('fr'));
    const enHtml = renderMetadataSheet(en, manifest, await loadSmallSiteAnalysis('en'));
    expect(frHtml).not.toContain(fr.metadata.legalNameLabel);
    expect(frHtml).not.toContain('Dénomination sociale');
    expect(enHtml).not.toContain(en.metadata.legalNameLabel);
    expect(enHtml).not.toContain('Legal name');
  });
});

// item 3.9: the cover used to print the client's name three times (H1,
// "Dénomination sociale", "Préparé pour") - recipientName is still never
// rendered, even when supplied, since all three legitimately held the same
// company name with no distinct contact-person field to repurpose it as.
describe('item 3.9: "Préparé pour" never renders', () => {
  it('on the cover, even when recipientName is supplied', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis, [], {
      nomCommercial: { value: 'Acme SAS', provenance: 'operator' },
      recipientName: { value: 'Jane Doe', provenance: 'operator' },
      updatedAt: new Date(),
    });
    expect(html).not.toContain(fr.cover.recipientLabel);
    expect(html).not.toContain('Jane Doe');
  });

  it('on the metadata sheet either', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(fr, manifest, analysis, [], {
      recipientName: { value: 'Jane Doe', provenance: 'operator' },
      updatedAt: new Date(),
    });
    expect(html).not.toContain('Jane Doe');
  });
});

// Plan 018 step 4: the cover renders the shared resolver's exact bytes -
// generic-question.ts is the only place the question exists, so a local
// string literal in cover.ts (or a drift between the two) is a test
// failure. Plan 018 step 5 binds report-intro.ts to the same resolver, and
// plan 019 replaces the generic question by extending the resolver, never
// by forking the copy.
describe('the cover carries the canonical generic decision question, byte for byte', () => {
  it('the resolver returns the canonical French bytes from the flat design source', () => {
    expect(resolveGenericDecisionQuestion('fr')).toBe(
      'Quel est l\u2019état actuel de votre site, et par où commencer\u00a0?',
    );
  });

  it('the resolver returns the canonical English bytes', () => {
    expect(resolveGenericDecisionQuestion('en')).toBe(
      'What is the current state of your site, and where should you start?',
    );
  });

  it('the French cover renders the resolver output verbatim', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis);
    expect(html).toContain(resolveGenericDecisionQuestion('fr'));
  });

  it('the English cover renders the resolver output verbatim', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('en');
    const html = renderCover(en, manifest, analysis);
    expect(html).toContain(resolveGenericDecisionQuestion('en'));
  });
});

// Plan 019 step 7: the cover's decision question is the preparation
// preview's resolved value for this language when a preview is passed in,
// and exactly the plan 018 generic bytes when it is not.
describe('renderCover decision question (plan 019)', () => {
  const frPreview: PreparationPreviewLanguage = {
    language: 'fr',
    coverQuestion: { value: 'Question personnalisée ?', source: 'custom' },
    hook: { family: 'mixed', value: 'Phrase.', evidenceUnavailable: true },
    stakeholders: [],
    journeys: [],
  };

  it('renders the preview question when preparation is supplied', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis, [], undefined, frPreview);
    expect(html).toContain('Question personnalisée ?');
    expect(html).not.toContain(resolveGenericDecisionQuestion('fr'));
  });

  it('renders the generic question bytes without preparation', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis);
    expect(html).toContain(resolveGenericDecisionQuestion('fr'));
    expect(html).not.toContain('Question personnalisée ?');
  });
});
