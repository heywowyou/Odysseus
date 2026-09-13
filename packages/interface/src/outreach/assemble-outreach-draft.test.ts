import { buildOutreachFactsBlock, type OutreachFactsBlock } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import {
  assembleOutreachDraft,
  type AssembledOutreachDraft,
  type AssembleOutreachDraftOptions,
} from './assemble-outreach-draft.js';

const PREVIEW_URL = 'https://www.odysseusaudit.com/apercu/abc123';
const PRIVACY_URL = 'https://www.odysseusaudit.com/confidentialite-prospection';
const OPT_OUT_URL = 'https://www.odysseusaudit.com/desinscription';

const TOUCH1_BASE: AssembleOutreachDraftOptions = {
  touch: 1,
  language: 'fr',
  hotelName: 'Hôtel des Tilleuls',
  variantSeed: 'candidate-1',
  categories: ['accessibility', 'seo', 'performance'],
  previewUrl: PREVIEW_URL,
  dataOrigins: ['public-hotel-catalogue', 'public-website'],
  privacyUrl: PRIVACY_URL,
  optOutUrl: OPT_OUT_URL,
};

const TOUCH2_BASE: AssembleOutreachDraftOptions = {
  touch: 2,
  language: 'fr',
  hotelName: 'Hôtel des Tilleuls',
  variantSeed: 'candidate-1',
  previousSubject: 'Audit du site de l’Hôtel des Tilleuls',
};

function assertAssembled(
  result: ReturnType<typeof assembleOutreachDraft>,
): asserts result is AssembledOutreachDraft {
  if (!result.assembled) throw new Error(`expected assembled, got refusal: ${result.refusal}`);
}

function touch3ExpectedFacts(): OutreachFactsBlock {
  return buildOutreachFactsBlock({
    assessment: undefined,
    language: 'fr',
    capabilities: { argumentB: true },
  });
}

const LEADING_GREETING = /^\s*(?:bonjour|bonsoir|salut|madame|monsieur|hello|hi|hey|dear)\b/iu;

function assertGreetsExactlyOnce(body: string): void {
  const paragraphs = body.split('\n\n');
  expect(paragraphs.filter((paragraph) => LEADING_GREETING.test(paragraph))).toHaveLength(1);
  expect(paragraphs[0]).toMatch(LEADING_GREETING);
}

function assertKeepsFrenchSignature(body: string): void {
  expect(body).toContain(
    'Cordialement,\n\n' +
      'Jules Fontaine\n' +
      'Fondateur — Odysseus\n' +
      'Audits techniques de sites web : SEO, GEO, performance, accessibilité et sécurité\n' +
      'odysseusaudit.com · contact@odysseusaudit.fr',
  );
}

describe('assembleOutreachDraft - touch 1', () => {
  it('assembles the locked French first-touch frame', () => {
    const result = assembleOutreachDraft(TOUCH1_BASE);
    assertAssembled(result);

    expect([
      "Audit du site de l'Hôtel des Tilleuls",
      "Analyse du site de l'Hôtel des Tilleuls",
    ]).toContain(result.subject);
    assertGreetsExactlyOnce(result.body);
    expect(result.body).toContain(
      "Nous avons récemment effectué un audit du site web de l'Hôtel des Tilleuls",
    );
    expect(result.body).toContain(
      "1 constat critique lié à l'accessibilité, 1 lié au référencement dans les moteurs de recherche et 1 lié aux performances du site.",
    );
    expect(result.body).toContain(
      `Vous trouverez un résumé de notre analyse ici\u00a0:\n${PREVIEW_URL}`,
    );
    expect(result.body).toContain(
      "L'audit complet de votre site est disponible à l'achat dès à présent. Pour chacun de ces constats, il indique la page concernée et la correction à apporter.",
    );
    expect(result.body).not.toContain("L'audit complet est disponible à l'achat dès à présent.");
    expect(result.body).toContain('Souhaitez-vous recevoir le détail de ces constats\u00a0?');
    assertKeepsFrenchSignature(result.body);
    expect(result.body).toContain('Pourquoi vous recevez ce message\u00a0:');
    expect(result.body).toContain('deux relances au maximum');
    expect(result.body).toContain('Sources utilisées\u00a0:');
    expect(result.body).toContain(
      'Responsable du traitement\u00a0: Jules Fontaine — Odysseus · contact@odysseusaudit.fr.',
    );
    expect(result.body).toContain(PRIVACY_URL);
    expect(result.body).toContain(OPT_OUT_URL);
    expect(result.body).not.toContain('Le cadre applicable');
  });

  it('renders real per-category critical counts from repeated category occurrences', () => {
    const result = assembleOutreachDraft({
      ...TOUCH1_BASE,
      categories: [
        ...Array.from({ length: 30 }, () => 'accessibility' as const),
        ...Array.from({ length: 13 }, () => 'rendering' as const),
        ...Array.from({ length: 18 }, () => 'performance' as const),
      ],
    });
    assertAssembled(result);
    expect(result.body).toContain(
      "30 constats critiques liés à l'accessibilité, 18 liés aux performances du site et 13 liés à l'affichage de votre contenu pour les moteurs de recherche.",
    );
  });

  it('falls back to a short subject when the hotel name is too long', () => {
    const result = assembleOutreachDraft({
      ...TOUCH1_BASE,
      hotelName: 'Hôtel Restaurant Campanile Toulouse Ouest Purpan Aéroport Blagnac Centre',
    });
    assertAssembled(result);
    expect(['Audit de votre site', 'Analyse de votre site']).toContain(result.subject);
  });

  it('writes "votre établissement" when there is no usable name', () => {
    const result = assembleOutreachDraft({ ...TOUCH1_BASE, hotelName: '  ' });
    assertAssembled(result);
    expect(result.body).toContain('du site web de votre établissement');
  });

  it('keeps the body canonical when only the variant seed changes', () => {
    const first = assembleOutreachDraft(TOUCH1_BASE);
    const second = assembleOutreachDraft({ ...TOUCH1_BASE, variantSeed: 'candidate-2' });
    assertAssembled(first);
    assertAssembled(second);
    expect(second.body).toBe(first.body);
  });

  it('refuses when no category is supplied', () => {
    expect(assembleOutreachDraft({ ...TOUCH1_BASE, categories: [] })).toEqual({
      assembled: false,
      refusal: 'missing-categories',
    });
  });

  it('writes the English template for an English draft', () => {
    const result = assembleOutreachDraft({ ...TOUCH1_BASE, language: 'en' });
    assertAssembled(result);
    expect([
      'Website audit of Hôtel des Tilleuls',
      'Website analysis of Hôtel des Tilleuls',
    ]).toContain(result.subject);
    expect(result.body).toContain(
      'We recently carried out an audit of the website of Hôtel des Tilleuls',
    );
    expect(result.body).toContain('1 critical finding related to accessibility');
    expect(result.body).toContain('The full audit is available for purchase now.');
  });

  it('refuses when required first-touch inputs are missing', () => {
    const { previewUrl: _preview, ...withoutPreview } = TOUCH1_BASE;
    expect(assembleOutreachDraft(withoutPreview)).toEqual({
      assembled: false,
      refusal: 'missing-preview-url',
    });
    expect(assembleOutreachDraft({ ...TOUCH1_BASE, dataOrigins: [] })).toEqual({
      assembled: false,
      refusal: 'missing-data-origins',
    });
    const { privacyUrl: _privacy, ...withoutPrivacy } = TOUCH1_BASE;
    expect(assembleOutreachDraft(withoutPrivacy)).toEqual({
      assembled: false,
      refusal: 'missing-privacy-url',
    });
    const { optOutUrl: _optOut, ...withoutOptOut } = TOUCH1_BASE;
    expect(assembleOutreachDraft(withoutOptOut)).toEqual({
      assembled: false,
      refusal: 'missing-opt-out-url',
    });
  });

  it('renders the three first-touch URLs as anchors and the footer actions inline', () => {
    const result = assembleOutreachDraft(TOUCH1_BASE);
    assertAssembled(result);
    expect(result.htmlBody).toContain(`href="${PREVIEW_URL}"`);
    expect(result.htmlBody).toContain(`href="${OPT_OUT_URL}"`);
    expect(result.htmlBody).toContain(`href="${PRIVACY_URL}"`);
    expect(result.htmlBody.match(/<a /gu)).toHaveLength(3);
    expect(result.htmlBody).toContain(
      `style="font-weight:600;text-decoration:underline">Consulter l&#39;aperçu de votre site</a>`,
    );
    expect(result.htmlBody).toContain('Ne plus être contacté</a> · <a');
    expect(result.htmlBody).toContain(
      'style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#202124"',
    );
    expect(result.htmlBody).toContain(
      'style="margin-top:24px;padding-top:12px;border-top:1px solid #dadce0;color:#6b6b6b;font-size:12px;line-height:1.5"',
    );
    expect(result.htmlBody).toContain(
      `style="color:#6b6b6b;text-decoration:underline">Ne plus être contacté</a> · <a href="${PRIVACY_URL}" style="color:#6b6b6b;text-decoration:underline"`,
    );
    expect(result.htmlBody).toContain(
      '<span style="font-weight:600">Jules Fontaine</span><br><span style="color:#5f6368">Fondateur — Odysseus<br>Audits techniques de sites web : SEO, GEO, performance, accessibilité et sécurité<br>odysseusaudit.com · contact@odysseusaudit.fr</span>',
    );
    expect(result.htmlBody).not.toMatch(/<img|<script|<link|<button|src=|url\(/iu);
  });
});

describe('assembleOutreachDraft - touch 2', () => {
  it('assembles the locked no-link commercial reminder', () => {
    const result = assembleOutreachDraft(TOUCH2_BASE);
    assertAssembled(result);

    expect(result.subject).toBe('Re: Audit du site de l’Hôtel des Tilleuls');
    expect(result.body).toContain(
      "Je me permets de revenir vers vous au sujet de mon précédent message concernant l'audit du site de l'Hôtel des Tilleuls.",
    );
    expect(result.body).toContain("Avez-vous eu l'occasion de consulter l'aperçu\u00a0?");
    expect(result.body).toContain(
      "Si vous souhaitez aller plus loin, l'audit complet de votre site est disponible à l'achat. Il détaille chacun des constats relevés, les pages concernées et les corrections à apporter.",
    );
    expect(result.body).not.toContain(
      "Si vous souhaitez aller plus loin, l'audit complet est disponible à l'achat.",
    );
    expect(result.body).toContain(
      'Pour ne plus recevoir de message de notre part, répondez simplement à celui-ci.',
    );
    assertKeepsFrenchSignature(result.body);
    expect(result.body).not.toMatch(/https?:\/\//u);
    expect(result.htmlBody).not.toContain('<a ');
    expect(result.htmlBody).not.toMatch(/<img|<script|<link|<button|src=|url\(/iu);
  });

  it('does not double-prefix an existing Re:', () => {
    const result = assembleOutreachDraft({
      ...TOUCH2_BASE,
      previousSubject: 'Re: Audit du site de l’Hôtel des Tilleuls',
    });
    assertAssembled(result);
    expect(result.subject).toBe('Re: Audit du site de l’Hôtel des Tilleuls');
  });

  it('refuses when the previous subject is missing', () => {
    const { previousSubject: _omitted, ...withoutSubject } = TOUCH2_BASE;
    expect(assembleOutreachDraft(withoutSubject)).toEqual({
      assembled: false,
      refusal: 'missing-previous-subject',
    });
  });
});

describe('assembleOutreachDraft - touch 3', () => {
  it('preserves the deterministic legal facts block inside the locked final frame', () => {
    const expectedFacts = touch3ExpectedFacts();
    const result = assembleOutreachDraft({ ...TOUCH2_BASE, touch: 3, expectedFacts });
    assertAssembled(result);

    expect(result.body).toContain(
      "Je me permets de vous écrire une dernière fois au sujet de l'audit du site de l'Hôtel des Tilleuls.",
    );
    expect(result.body).toContain(
      "Avant de clore ce sujet, je souhaitais attirer votre attention sur le cadre réglementaire de l'accessibilité numérique, au regard des constats relevés lors de notre analyse.",
    );
    if (expectedFacts.state !== 'rendered') throw new Error('expected a rendered facts block');
    expect(result.body).toContain(expectedFacts.heading);
    for (const paragraph of expectedFacts.paragraphs) expect(result.body).toContain(paragraph);
    expect(result.body).toContain("l'audit complet est disponible à l'achat");
    expect(result.body).not.toContain("l'audit complet de votre site est disponible à l'achat");
    expect(result.body).toContain(
      'Sans retour de votre part, je ne vous relancerai pas davantage.',
    );
    expect(result.body).toContain(
      'Si vous souhaitez que nous effacions ces données de registre, répondez simplement à ' +
        'ce message\u00a0: nous les supprimerons.',
    );
    assertKeepsFrenchSignature(result.body);
    expect(result.body).not.toMatch(/https?:\/\//u);
    expect(result.htmlBody).not.toContain('<a ');
    expect(result.htmlBody).toContain('<div>Cadre réglementaire à vérifier</div>');
    expect(result.htmlBody).not.toMatch(/<img|<script|<link|<button|src=|url\(/iu);
    expect(result.body.indexOf(expectedFacts.heading)).toBeLessThan(
      result.body.indexOf('Cordialement,'),
    );
  });

  it('refuses when the facts block is absent or stale', () => {
    expect(assembleOutreachDraft({ ...TOUCH2_BASE, touch: 3 })).toEqual({
      assembled: false,
      refusal: 'missing-facts-inputs',
    });
    const stale: OutreachFactsBlock = { state: 'omitted' };
    expect(assembleOutreachDraft({ ...TOUCH2_BASE, touch: 3, expectedFacts: stale })).toEqual({
      assembled: false,
      refusal: 'facts-block-mismatch',
    });
  });
});
