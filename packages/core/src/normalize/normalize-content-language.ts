/**
 * Plan 075 L5: a page whose declared language is not the language it is
 * written in. regina-hotel declares its 67 Portuguese pages `lang="br"`,
 * which is Breton: a screen reader reads them with Breton rules (WCAG
 * 3.1.1, level A). axe's `html-lang-valid` checks only that the code is
 * well formed, so nothing reported it.
 *
 * The language of the text is read from what every scan stores for every
 * page, its title and headings, pooled over all the pages that share one
 * declared language, so a single mixed page never decides. The detector is
 * a deliberately small word and letter profile over the languages the
 * audited sites use, not a general classifier: it only has to tell those
 * languages apart on a few hundred words, and it reports only with a wide
 * margin.
 *
 * Two shapes are left alone on purpose:
 *  - a language group whose text reads as the site's main language. That
 *    is untranslated copy on a translated page (lacoorniche's Spanish and
 *    Italian pages keep French headings), which title-not-translated
 *    covers for the title, not a wrong language code.
 *  - a group written in a language the profile does not know (Chinese),
 *    which scores too low to pass the floor.
 */

import type { FindingCandidate } from './candidate.js';
import { primaryLanguageSubtag } from './normalize-hreflang.js';
import { severityFromCustom } from './severity.js';

export const HTML_LANG_CONTENT_MISMATCH_RULE_ID = 'html-lang-content-mismatch';

/** Frequent words that are distinctive enough between these languages.
 *  Words shared by several of them ("de", "la", "en") are left out. */
const PROFILE_WORDS: Readonly<Record<string, string>> = {
  fr: 'le la les des du et une pour avec sur dans nos notre vos votre est aux où cette qui chambre chambres séjour hôtel nous vous ou pas plus très',
  en: 'the and of to for with our your is on at by from this that are room rooms stay hotel we you or not more very',
  es: 'el los las del y para con nuestro nuestra nuestras nuestros una por es al sus que habitación habitaciones estancia hotel nosotros usted o no más muy',
  it: 'il lo gli di del della e per con nostro nostra una è al sono che camera camere soggiorno albergo noi voi o non più molto',
  de: 'der die das und mit für zu den dem ein eine ist auf von unser unsere zimmer aufenthalt wir sie oder nicht mehr sehr',
  pt: 'o os do da dos das e em no na para com um uma nosso nossa é ao que quarto quartos estadia nós você ou não mais muito férias',
  nl: 'het een van met voor onze kamer kamers verblijf wij niet meer zeer ons naar bij',
};

/** Letters and endings that belong to one language of the profile. */
const PROFILE_LETTERS: Readonly<Record<string, RegExp>> = {
  pt: /[ãõ]|ção|ções/g,
  es: /[ñ¿¡]/g,
  de: /[ßäöü]/g,
  fr: /[êëîœ]|[a-z]'[aeiouéh]/g,
  it: /\b(?:perché|più)\b/g,
};

const PROFILE_SETS = Object.fromEntries(
  Object.entries(PROFILE_WORDS).map(([language, words]) => [language, new Set(words.split(' '))]),
);

/** Below this score the text is too short, or not in a profiled language. */
const MIN_SCORE = 30;
/** The winning language must score at least this many times the next. */
const MIN_MARGIN = 2;
/** A declared language needs this many pages before its text is judged. */
const MIN_PAGES = 3;

export interface TextLanguageScore {
  language: string;
  score: number;
  runnerUp: string;
  runnerUpScore: number;
}

/** Pure: scores a text against the profile and returns the two best
 *  languages. Exported for the unit tests. */
export function scoreTextLanguage(text: string): TextLanguageScore {
  const lower = text.toLowerCase();
  const scores = new Map<string, number>(
    Object.keys(PROFILE_WORDS).map((language) => [language, 0]),
  );
  for (const word of lower.split(/[^a-zà-ÿœç']+/)) {
    if (word === '') continue;
    for (const [language, words] of Object.entries(PROFILE_SETS)) {
      if (words.has(word)) scores.set(language, scores.get(language)! + 1);
    }
  }
  for (const [language, pattern] of Object.entries(PROFILE_LETTERS)) {
    scores.set(language, scores.get(language)! + 2 * (lower.match(pattern)?.length ?? 0));
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  return {
    language: ranked[0]![0],
    score: ranked[0]![1],
    runnerUp: ranked[1]![0],
    runnerUpScore: ranked[1]![1],
  };
}

export interface ContentLanguagePageInput {
  url: string;
  htmlLang: string | null | undefined;
  title: string | null;
  headings: readonly { text: string }[];
}

export function extractContentLanguageCandidates(
  pages: readonly ContentLanguagePageInput[],
): FindingCandidate[] {
  const groups = new Map<string, ContentLanguagePageInput[]>();
  for (const page of pages) {
    const declared = primaryLanguageSubtag(page.htmlLang);
    if (declared === undefined) continue;
    const group = groups.get(declared) ?? [];
    group.push(page);
    groups.set(declared, group);
  }
  // The site's main language is the one most of its pages declare.
  const mainLanguage = [...groups].sort((a, b) => b[1].length - a[1].length)[0]?.[0];

  const candidates: FindingCandidate[] = [];
  for (const [declared, group] of groups) {
    if (group.length < MIN_PAGES) continue;
    const text = group
      .map((page) =>
        [page.title ?? '', ...page.headings.map((heading) => heading.text)].join(' . '),
      )
      .join(' . ');
    const detected = scoreTextLanguage(text);
    if (detected.language === declared || detected.language === mainLanguage) continue;
    if (detected.score < MIN_SCORE) continue;
    if (detected.score < MIN_MARGIN * Math.max(detected.runnerUpScore, 1)) continue;

    for (const page of group) {
      candidates.push({
        source: 'custom',
        ruleId: HTML_LANG_CONTENT_MISMATCH_RULE_ID,
        category: 'accessibility',
        severity: severityFromCustom(HTML_LANG_CONTENT_MISMATCH_RULE_ID),
        wcagCriteria: ['3.1.1'],
        title: "The page's declared language is not the language of its text",
        description: `These pages declare their language as "${page.htmlLang}", but their titles and headings are written in another language (read as "${detected.language}"). A screen reader pronounces the text with the rules of the declared language, which makes it hard or impossible to understand.`,
        pageUrl: page.url,
        dedupeIdentity: `declared:${declared}>written:${detected.language}`,
        element: {
          pageUrl: page.url,
          selector: 'html[lang]',
          snippet: `<html lang="${page.htmlLang}">`,
        },
        rawEvidenceForPage: { declaredLanguage: page.htmlLang, writtenLanguage: detected.language },
      });
    }
  }
  return candidates;
}
