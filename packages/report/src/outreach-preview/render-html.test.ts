import { describe, expect, it } from 'vitest';
import { buildOutreachFactsBlock, formatFullAuditPrice } from '@odysseus/core';
import { generateOutreachPreviewHtml } from './render-html.js';
import { previewTestImage, previewTestInput } from './test-fixtures.js';

const LANGUAGES = ['fr', 'en'] as const;

function facts(language: 'fr' | 'en') {
  return buildOutreachFactsBlock({
    assessment: undefined,
    language,
    capabilities: { argumentB: true },
  });
}

describe('generateOutreachPreviewHtml', () => {
  it.each(LANGUAGES)('renders a complete %s document', (language) => {
    const html = generateOutreachPreviewHtml(
      previewTestInput({ language, facts: facts(language) }),
    );
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(`<html lang="${language}">`);
    expect(html).toContain('Hôtel Exemple');
  });

  describe('the four evidence branches', () => {
    it.each([
      ['both assets', [previewTestImage({ kind: 'render-comparison' }), previewTestImage()]],
      ['the failure crop only', [previewTestImage()]],
      ['the composite only', [previewTestImage({ kind: 'render-comparison' })]],
      // Trade-off 36 v2: a server-rendered hotel produces no composite, and a
      // failure crop can still be absent, so this is a real shape rather than a
      // defensive one.
      ['no image at all', []],
    ])('renders with %s', (_label, images) => {
      const html = generateOutreachPreviewHtml(previewTestInput({ images }));
      expect(html).toContain('</html>');
      // No empty figure, and no heading standing over nothing.
      expect(html).not.toMatch(/<figure>\s*<\/figure>/u);
      if (images.length === 0) expect(html).not.toContain('La preuve en image');
      else expect(html).toContain('La preuve en image');
    });
  });

  it('embeds every image as a data URI and never as a remote asset', () => {
    const html = generateOutreachPreviewHtml(
      previewTestInput({
        images: [previewTestImage({ kind: 'render-comparison' }), previewTestImage()],
      }),
    );
    const sources = [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/gu)].map((match) => match[1]);
    expect(sources).toHaveLength(2);
    for (const source of sources) expect(source?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('names the offer price exactly once and no other amount', () => {
    for (const language of LANGUAGES) {
      const html = generateOutreachPreviewHtml(previewTestInput({ language }));
      const price = formatFullAuditPrice(language);
      expect(html.split(price).length - 1).toBe(1);
    }
  });

  it('omits the legal section entirely when the source material does not support it', () => {
    const html = generateOutreachPreviewHtml(
      previewTestInput({
        facts: buildOutreachFactsBlock({
          assessment: undefined,
          language: 'fr',
          capabilities: { argumentB: false },
        }),
      }),
    );
    expect(html).not.toContain('Cadre réglementaire à vérifier');
    expect(html).toContain('</html>');
  });

  it('renders the legal section when it is supported', () => {
    const html = generateOutreachPreviewHtml(previewTestInput({ facts: facts('fr') }));
    expect(html).toContain('Cadre réglementaire à vérifier');
    expect(html).toContain('Faites confirmer votre situation par votre conseil juridique');
  });

  describe('the RGPD article 14 disclosures', () => {
    it.each(LANGUAGES)(
      'names controller, data, origin, purpose, basis and rights in %s',
      (language) => {
        const html = generateOutreachPreviewHtml(
          previewTestInput({ language, facts: facts(language) }),
        );
        const required =
          language === 'fr'
            ? [
                'responsable de traitement',
                'contact@odysseusaudit.com',
                'Ces informations proviennent de',
                'classement public',
                'La finalité',
                'base légale',
                'CNIL',
                'Ne plus être contacté',
              ]
            : [
                'data controller',
                'contact@odysseusaudit.com',
                'This information came from',
                'tourist accommodation classification',
                'The purpose',
                'legal basis',
                'CNIL',
                'Stop hearing from us',
              ];
        for (const fragment of required) expect(html).toContain(fragment);
      },
    );
  });

  describe('hostile input', () => {
    // Only fields the schema still permits free text in can carry an attack;
    // everything else is a closed vocabulary and is rejected before rendering.
    const HOSTILE = '<script>alert(1)</script>" onload="steal()';

    it('rejects a business name carrying markup rather than escaping it through', () => {
      // Escaping would render it harmlessly, but a name with a tag in it is not
      // a name, and the guard is cheaper to trust than an escaping audit.
      expect(() =>
        generateOutreachPreviewHtml(previewTestInput({ businessName: 'Hôtel <b>X</b>' })),
      ).toThrow();
    });

    it('escapes the characters a real business name can legitimately contain', () => {
      const html = generateOutreachPreviewHtml(
        previewTestInput({ businessName: `Hôtel Bex & Fils "L'Escale"` }),
      );
      expect(html).toContain('Hôtel Bex &amp; Fils &quot;L&#39;Escale&quot;');
    });

    it('rejects a business name that carries markup and an event handler', () => {
      expect(() =>
        generateOutreachPreviewHtml(previewTestInput({ businessName: HOSTILE })),
      ).toThrow();
    });

    it('rejects alt text that reads like an event handler', () => {
      expect(() =>
        generateOutreachPreviewHtml(
          previewTestInput({
            images: [previewTestImage({ altText: { fr: 'a" onerror="x', en: 'a" onerror="x' } })],
          }),
        ),
      ).toThrow();
    });

    it('rejects a facts paragraph that states a conclusion', () => {
      expect(() =>
        generateOutreachPreviewHtml(
          previewTestInput({
            facts: { state: 'rendered', heading: 'Cadre', paragraphs: ['Vous devez agir.'] },
          }),
        ),
      ).toThrow();
    });
  });

  it('contains no script, no inline handler, no form and no insecure URL', () => {
    for (const language of LANGUAGES) {
      const html = generateOutreachPreviewHtml(
        previewTestInput({ language, facts: facts(language) }),
      );
      expect(html).not.toMatch(/<\s*script\b/iu);
      expect(html).not.toMatch(/<\s*form\b/iu);
      expect(html).not.toMatch(/\son[a-z]+\s*=/iu);
      expect(html).not.toContain('http://');
    }
  });

  it('links only to allowlisted https hosts', () => {
    const html = generateOutreachPreviewHtml(previewTestInput({ facts: facts('fr') }));
    const hrefs = [...html.matchAll(/href="([^"]+)"/gu)].map((match) => match[1] ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(new URL(href).hostname).toMatch(/^(?:www\.)?odysseusaudit\.(?:com|fr)$/u);
    }
  });

  it('is deterministic', () => {
    const build = () => generateOutreachPreviewHtml(previewTestInput({ facts: facts('fr') }));
    expect(build()).toBe(build());
  });

  it('refuses an input the contract rejects rather than rendering something partial', () => {
    expect(() => generateOutreachPreviewHtml(previewTestInput({ summaries: [] }))).toThrow();
  });
});
