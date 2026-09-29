import { describe, expect, it } from 'vitest';
import {
  extractContentLanguageCandidates,
  HTML_LANG_CONTENT_MISMATCH_RULE_ID,
  scoreTextLanguage,
  type ContentLanguagePageInput,
} from './normalize-content-language.js';

function page(
  path: string,
  htmlLang: string,
  title: string,
  headings: string[],
): ContentLanguagePageInput {
  return {
    url: `https://www.example-hotel.com${path}`,
    htmlLang,
    title,
    headings: headings.map((text) => ({ text })),
  };
}

// Shapes of regina-hotel's stored pages (2026-09-25): French main pages, and
// Portuguese pages declared `lang="br"`, which is Breton.
const FRENCH = Array.from({ length: 6 }, (_, index) =>
  page(`/fr/page-${index}`, 'fr', `Nos chambres et suites ${index} | Hôtel`, [
    'Un séjour au cœur de Paris',
    'Découvrez nos chambres avec vue sur le jardin',
    'Réservez votre séjour dans notre hôtel pour une expérience très agréable',
  ]),
);
const PORTUGUESE_AS_BRETON = [
  page('/br/actuality/exposicao.8444.html', 'br', 'Exposição fotográfica no Hotel Regina Louvre', [
    'Uma exposição fotográfica para os nossos hóspedes',
    'Descubra a coleção do hotel com vista para o jardim',
  ]),
  page('/br/actuality/ferias.8502.html', 'br', 'Férias de verão em Paris', [
    'As férias de verão em Paris são mais bonitas com a nossa equipe',
    'Os quartos do hotel estão prontos para a sua estadia',
  ]),
  page('/br/quartos.html', 'br', 'Os nossos quartos e suítes', [
    'Quartos com vista para o jardim das Tulherias',
    'Uma estadia muito confortável no coração de Paris, com atenção e emoção',
    'Não perca as nossas ofertas para a sua próxima estadia',
  ]),
];

describe('scoreTextLanguage', () => {
  it('reads Portuguese as Portuguese and French as French', () => {
    expect(
      scoreTextLanguage('Os quartos do hotel estão prontos para a sua estadia em Paris').language,
    ).toBe('pt');
    expect(
      scoreTextLanguage('Réservez votre séjour dans notre hôtel pour une expérience très agréable')
        .language,
    ).toBe('fr');
  });
});

describe('html-lang-content-mismatch (plan 075 L5)', () => {
  it('reports every page of a group whose text is in another language', () => {
    const candidates = extractContentLanguageCandidates([...FRENCH, ...PORTUGUESE_AS_BRETON]);
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.dedupeIdentity))).toEqual(
      new Set(['declared:br>written:pt']),
    );
    expect(candidates[0]).toMatchObject({
      ruleId: HTML_LANG_CONTENT_MISMATCH_RULE_ID,
      category: 'accessibility',
      severity: 'serious',
      wcagCriteria: ['3.1.1'],
    });
  });

  it('leaves a correctly declared multilingual site alone', () => {
    const portuguese = PORTUGUESE_AS_BRETON.map((entry) => ({ ...entry, htmlLang: 'pt-BR' }));
    expect(extractContentLanguageCandidates([...FRENCH, ...portuguese])).toEqual([]);
  });

  it('leaves untranslated pages that fall back to the main language alone', () => {
    // lacoorniche: its Spanish pages keep French headings.
    const spanishWithFrenchCopy = FRENCH.slice(0, 3).map((entry, index) => ({
      ...entry,
      url: `https://www.example-hotel.com/es/pagina-${index}`,
      htmlLang: 'es',
    }));
    expect(extractContentLanguageCandidates([...FRENCH, ...spanishWithFrenchCopy])).toEqual([]);
  });

  it('needs three pages and a wide margin before it reports', () => {
    expect(
      extractContentLanguageCandidates([...FRENCH, ...PORTUGUESE_AS_BRETON.slice(0, 2)]),
    ).toEqual([]);
    const mixed = page('/br/mixed.html', 'br', 'Hotel Regina', ['Paris', 'Louvre', 'Tuileries']);
    expect(extractContentLanguageCandidates([...FRENCH, mixed, mixed, mixed])).toEqual([]);
  });
});
