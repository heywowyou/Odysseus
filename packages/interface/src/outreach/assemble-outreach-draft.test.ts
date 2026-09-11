import { describe, expect, it } from 'vitest';
import { buildOutreachFactsBlock, type OutreachFactsBlock } from '@odysseus/core';
import {
  assembleOutreachDraft,
  type AssembleOutreachDraftOptions,
  type AssembledOutreachDraft,
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
  previousSubject: 'Un point rapide sur votre site',
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

/** The greeting belongs to the assembler alone. The model's own fields are
 *  kept clear of one upstream, by outreach-vocabulary-guard's
 *  leading-salutation rule; this asserts the visible consequence, which is
 *  what a real touch 1 read-through caught failing: the recipient saw
 *  "Bonjour," and then "Bonjour, nous avons regarde...". */
const LEADING_GREETING = /^\s*(?:bonjour|bonsoir|salut|madame|monsieur|hello|hi|hey|dear)\b/iu;

function assertGreetsExactlyOnce(body: string): void {
  const paragraphs = body.split('\n\n');
  expect(paragraphs.filter((paragraph) => LEADING_GREETING.test(paragraph))).toHaveLength(1);
  expect(paragraphs[0]).toMatch(LEADING_GREETING);
}

describe('assembleOutreachDraft - touch 1', () => {
  it('assembles a complete draft', () => {
    const result = assembleOutreachDraft(TOUCH1_BASE);
    assertAssembled(result);

    expect(result.subject).toBe(
      'Hôtel des Tilleuls\u00a0: accessibilité, référencement et performance',
    );
    expect(result.body).toContain('Bonjour,');
    assertGreetsExactlyOnce(result.body);
    expect(result.body).toContain("le site de l'Hôtel des Tilleuls");
    expect(result.body).toContain(
      "notamment en matière d'accessibilité, de référencement dans les moteurs de recherche et de vitesse de chargement.",
    );
    expect(result.body).toContain(
      `Vous trouverez un résumé de notre analyse ici\u00a0:\n${PREVIEW_URL}`,
    );
    expect(result.body).toContain('la page concernée et la correction à apporter.');
    expect(result.body).toContain(
      'Responsable du traitement\u00a0: Jules Fontaine (Odysseus), contact@odysseusaudit.fr.',
    );
    expect(result.body).toContain(
      'le classement public des hébergements touristiques (Atout France), votre site internet.',
    );
    expect(result.body).toContain('deux relances au plus');
    expect(result.body).toContain('Bien cordialement,');
    expect(result.body).toContain('Jules Fontaine\nFondateur, Odysseus\nAudit de sites web');
    expect(result.body).toContain(PRIVACY_URL);
    expect(result.body).toContain(OPT_OUT_URL);
    expect(result.body).not.toContain('odysseusaudit.com.');
    // No touch 3 content leaks into touch 1.
    expect(result.body).not.toContain('Le cadre applicable');
  });

  it('names only the categories it is given, folding rendering into search', () => {
    const result = assembleOutreachDraft({
      ...TOUCH1_BASE,
      categories: ['rendering', 'seo', 'seo'],
    });
    assertAssembled(result);
    expect(result.subject).toBe('Hôtel des Tilleuls\u00a0: référencement');
    expect(result.body).toContain(
      'notamment en matière de référencement dans les moteurs de recherche.',
    );
    expect(result.body).not.toContain("d'affichage de votre contenu");
    expect(result.body).not.toContain('accessibilité');
  });

  it('falls back to "Votre site" when the name makes the subject too long', () => {
    const result = assembleOutreachDraft({
      ...TOUCH1_BASE,
      hotelName: 'Hôtel Restaurant Campanile Toulouse Ouest Purpan Aéroport Blagnac Centre',
    });
    assertAssembled(result);
    expect(result.subject).toBe('Votre site\u00a0: accessibilité, référencement et performance');
  });

  it('writes "votre établissement" when there is no usable name', () => {
    const result = assembleOutreachDraft({ ...TOUCH1_BASE, hotelName: '  ' });
    assertAssembled(result);
    expect(result.body).toContain('le site de votre établissement');
    expect(result.subject.startsWith('Votre site')).toBe(true);
  });

  it('always picks the same wording for the same hotel, and varies across hotels', () => {
    const first = assembleOutreachDraft(TOUCH1_BASE);
    const again = assembleOutreachDraft(TOUCH1_BASE);
    assertAssembled(first);
    assertAssembled(again);
    expect(again.body).toBe(first.body);
    const bodies = new Set(
      Array.from({ length: 12 }, (_, index) => {
        const result = assembleOutreachDraft({ ...TOUCH1_BASE, variantSeed: `candidate-${index}` });
        assertAssembled(result);
        return result.body;
      }),
    );
    expect(bodies.size).toBeGreaterThan(1);
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
    expect(result.subject).toBe('Hôtel des Tilleuls: accessibility, search and performance');
    expect(result.body).toContain('the website of Hôtel des Tilleuls');
    expect(result.body).toContain(
      'notably in accessibility, search engine visibility and loading speed.',
    );
  });

  it('refuses when the preview link is missing', () => {
    const { previewUrl: _omitted, ...withoutPreview } = TOUCH1_BASE;
    const result = assembleOutreachDraft(withoutPreview);
    expect(result).toEqual({ assembled: false, refusal: 'missing-preview-url' });
  });

  it('refuses when no data origins are supplied', () => {
    const result = assembleOutreachDraft({ ...TOUCH1_BASE, dataOrigins: [] });
    expect(result).toEqual({ assembled: false, refusal: 'missing-data-origins' });
  });

  it('refuses when the privacy link is missing', () => {
    const { privacyUrl: _omitted, ...withoutPrivacy } = TOUCH1_BASE;
    const result = assembleOutreachDraft(withoutPrivacy);
    expect(result).toEqual({ assembled: false, refusal: 'missing-privacy-url' });
  });

  it('refuses when the opt-out link is missing', () => {
    const { optOutUrl: _omitted, ...withoutOptOut } = TOUCH1_BASE;
    const result = assembleOutreachDraft(withoutOptOut);
    expect(result).toEqual({ assembled: false, refusal: 'missing-opt-out-url' });
  });
});

describe('assembleOutreachDraft - touch 2', () => {
  it('assembles a complete draft with a reply-based opt-out and no new link', () => {
    const result = assembleOutreachDraft(TOUCH2_BASE);
    assertAssembled(result);

    expect(result.subject).toBe('Re: Un point rapide sur votre site');
    expect(result.body).toContain("l'analyse du site de l'Hôtel des Tilleuls");
    expect(result.body).toContain(
      'Pour ne plus recevoir de message de notre part, répondez simplement à celui-ci.',
    );
    expect(result.body).not.toMatch(/https?:\/\//u);
    expect(result.htmlBody).not.toContain('<a ');
  });

  it('does not double-prefix a subject that already carries Re:', () => {
    const result = assembleOutreachDraft({
      ...TOUCH2_BASE,
      previousSubject: 'Re: Un point rapide sur votre site',
    });
    assertAssembled(result);
    expect(result.subject).toBe('Re: Un point rapide sur votre site');
  });

  it('refuses when the previous subject is missing', () => {
    const { previousSubject: _omitted, ...withoutSubject } = TOUCH2_BASE;
    const result = assembleOutreachDraft(withoutSubject);
    expect(result).toEqual({ assembled: false, refusal: 'missing-previous-subject' });
  });
});

describe('assembleOutreachDraft - touch 3', () => {
  it('assembles a complete draft with the rebuilt facts block spliced in', () => {
    const expectedFacts = touch3ExpectedFacts();
    const result = assembleOutreachDraft({ ...TOUCH2_BASE, touch: 3, expectedFacts });
    assertAssembled(result);

    expect(result.subject).toBe('Re: Un point rapide sur votre site');
    expect(result.body).toContain(
      "Ce sera notre dernier message au sujet du site de l'Hôtel des Tilleuls.",
    );
    expect(result.body).toContain(
      'Nous restons à votre disposition si vous souhaitez recevoir le détail de notre analyse.',
    );
    if (expectedFacts.state !== 'rendered') throw new Error('expected a rendered facts block');
    expect(result.body).toContain(expectedFacts.heading);
    for (const paragraph of expectedFacts.paragraphs) expect(result.body).toContain(paragraph);
    expect(result.body).toContain(
      'Si vous souhaitez que nous effacions ces données de registre, répondez simplement à ' +
        'ce message\u00a0: nous les supprimerons.',
    );
    expect(result.body).not.toMatch(/https?:\/\//u);
    expect(result.htmlBody).not.toContain('<a ');
    // The facts block reads before the sign-off, never below the signature.
    expect(result.body.indexOf(expectedFacts.heading)).toBeLessThan(
      result.body.indexOf('Bien cordialement,'),
    );
  });

  it('refuses when the facts block was not supplied', () => {
    const result = assembleOutreachDraft({ ...TOUCH2_BASE, touch: 3 });
    expect(result).toEqual({ assembled: false, refusal: 'missing-facts-inputs' });
  });

  it('refuses when the supplied facts block does not match a fresh rebuild', () => {
    const stale: OutreachFactsBlock = { state: 'omitted' };
    const result = assembleOutreachDraft({ ...TOUCH2_BASE, touch: 3, expectedFacts: stale });
    expect(result).toEqual({ assembled: false, refusal: 'facts-block-mismatch' });
  });
});

/** What a reader sees in the HTML part, links left out: tags dropped,
 *  entities decoded, whitespace collapsed. */
function visibleHtmlTextWithoutLinks(html: string): string {
  return html
    .replaceAll(/<a [^>]*>.*?<\/a>/gu, ' ')
    .replaceAll(/<br>/gu, ' ')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&nbsp;', '\u00a0')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

/** The text part with every line that carries a URL left out: those are the
 *  link lines, which the HTML part shows as anchors. */
function visibleTextWithoutLinks(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.includes('https://'))
    .join('\n')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

describe('assembleOutreachDraft - the text and HTML parts say the same thing', () => {
  const cases: Array<{ name: string; options: AssembleOutreachDraftOptions }> = [
    { name: 'touch 1', options: TOUCH1_BASE },
    { name: 'touch 2', options: TOUCH2_BASE },
    {
      name: 'touch 3',
      options: { ...TOUCH2_BASE, touch: 3, expectedFacts: touch3ExpectedFacts() },
    },
  ];

  it.each(cases)('$name', ({ options }) => {
    const result = assembleOutreachDraft(options);
    assertAssembled(result);
    expect(visibleHtmlTextWithoutLinks(result.htmlBody)).toBe(visibleTextWithoutLinks(result.body));
  });

  it('writes touch 1 links as anchors with their labels, never raw URLs', () => {
    const result = assembleOutreachDraft({ ...TOUCH1_BASE, dataOrigins: ['public-website'] });
    assertAssembled(result);
    expect(result.htmlBody).toContain(
      `ici\u00a0:<br><a href="${PREVIEW_URL}">Consulter l&#39;aperçu de votre site</a>`,
    );
    expect(result.htmlBody).toContain(`href="${OPT_OUT_URL}"`);
    expect(result.htmlBody).toContain(`href="${PRIVACY_URL}"`);
    expect(result.htmlBody.match(/<a /gu)).toHaveLength(3);
    expect(result.htmlBody).not.toMatch(/<img|src=|url\(/iu);
  });

  it('escapes the hotel name in the HTML part', () => {
    const result = assembleOutreachDraft({ ...TOUCH1_BASE, hotelName: 'Hôtel & Spa des Pêcheurs' });
    assertAssembled(result);
    expect(result.htmlBody).toContain('Hôtel &amp; Spa des Pêcheurs');
  });
});
