/**
 * A page served in one language whose <title> is still the site's primary
 * language version, word for word. Search engines show that title as the
 * headline of the result, so a visitor searching in English is offered a
 * French headline.
 *
 * The evidence is the page pair, never a language guess on one short string:
 * the site itself states, through hreflang or its language menu, that the two
 * URLs are the same page in two languages (translation-clusters.ts), and the
 * two titles are identical. A title can legitimately be the same in two
 * languages ("Contact - Hotel X", "Spa"), so one identical pair proves
 * nothing. The rule fires for a language only when the pattern holds for most
 * of that language's pairs, which is what an untranslated section looks like
 * and what a translated site with a few coincident titles does not.
 * Every language shares one identity: the fix is the same editorial task,
 * and translation clusters would fold the language versions together anyway.
 *
 * The primary language is the language of the site-level anchor page. When
 * the anchor declares none and its URL has no language prefix, there is no
 * reference version and nothing is reported.
 */

import type { FindingCandidate } from './candidate.js';
import { languagePrefixOf } from './normalize-hreflang.js';
import { severityFromCustom } from './severity.js';
import { canonicalizeUrlForMatching, type TranslationCluster } from './translation-clusters.js';

export const TITLE_NOT_TRANSLATED_RULE_ID = 'title-not-translated';

/** Fewer pairs than this cannot tell a pattern from coincidence. */
const MIN_PAIRS_PER_LANGUAGE = 3;

export interface UntranslatedTitleInput {
  clusters: readonly TranslationCluster[];
  /** Titles of the content pages eligible for SEO findings. */
  titleByPageUrl: ReadonlyMap<string, string | null>;
  siteLevelPageUrl?: string;
}

function baseLanguage(lang: string): string {
  return lang.toLowerCase().split('-')[0]!;
}

function comparableTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase();
}

function primaryLanguageOf(input: UntranslatedTitleInput): string | undefined {
  const anchor = input.siteLevelPageUrl;
  if (anchor === undefined) return undefined;
  const anchorKey = canonicalizeUrlForMatching(anchor);
  for (const cluster of input.clusters) {
    const member = cluster.members.find(
      (candidate) => canonicalizeUrlForMatching(candidate.pageUrl) === anchorKey,
    );
    if (member?.lang !== undefined) return baseLanguage(member.lang);
  }
  const prefix = languagePrefixOf(anchor);
  return prefix === undefined ? undefined : baseLanguage(prefix);
}

interface UntranslatedPair {
  pageUrl: string;
  lang: string;
  title: string;
  primaryPageUrl: string;
}

export function extractUntranslatedTitleCandidates(
  input: UntranslatedTitleInput,
): FindingCandidate[] {
  const primary = primaryLanguageOf(input);
  if (primary === undefined) return [];

  const titles = new Map<string, string>();
  for (const [url, title] of input.titleByPageUrl) {
    if (title !== null && title.trim() !== '') titles.set(canonicalizeUrlForMatching(url), title);
  }
  const titleOf = (url: string) => titles.get(canonicalizeUrlForMatching(url));

  const pairCountByLanguage = new Map<string, number>();
  const untranslatedByLanguage = new Map<string, UntranslatedPair[]>();

  for (const cluster of input.clusters) {
    if (cluster.members.length < 2) continue;
    const primaryMembers = cluster.members.filter(
      (member) => member.lang !== undefined && baseLanguage(member.lang) === primary,
    );
    if (primaryMembers.length !== 1) continue;
    const primaryMember = primaryMembers[0]!;
    const primaryTitle = titleOf(primaryMember.pageUrl);
    if (primaryTitle === undefined) continue;

    for (const member of cluster.members) {
      if (member.lang === undefined) continue;
      const lang = baseLanguage(member.lang);
      if (lang === primary) continue;
      const title = titleOf(member.pageUrl);
      if (title === undefined) continue;

      pairCountByLanguage.set(lang, (pairCountByLanguage.get(lang) ?? 0) + 1);
      if (comparableTitle(title) !== comparableTitle(primaryTitle)) continue;
      const bucket = untranslatedByLanguage.get(lang) ?? [];
      bucket.push({ pageUrl: member.pageUrl, lang, title, primaryPageUrl: primaryMember.pageUrl });
      untranslatedByLanguage.set(lang, bucket);
    }
  }

  const candidates: FindingCandidate[] = [];
  for (const [lang, pairs] of [...untranslatedByLanguage].sort(([a], [b]) => a.localeCompare(b))) {
    const pairCount = pairCountByLanguage.get(lang) ?? 0;
    if (pairs.length < MIN_PAIRS_PER_LANGUAGE || pairs.length * 2 < pairCount) continue;

    for (const pair of pairs) {
      candidates.push({
        source: 'custom',
        ruleId: TITLE_NOT_TRANSLATED_RULE_ID,
        category: 'seo',
        severity: severityFromCustom(TITLE_NOT_TRANSLATED_RULE_ID),
        wcagCriteria: [],
        title: 'Page title not translated',
        description: `This page repeats word for word the title of its "${primary}" version, although the site serves it as a translation. Search results show the title as the headline, so visitors searching in the page's language are offered a headline in another one.`,
        pageUrl: pair.pageUrl,
        dedupeIdentity: 'untranslated-title',
        element: {
          pageUrl: pair.pageUrl,
          selector: 'head > title',
          snippet: `<title>${pair.title}</title>`,
        },
        rawEvidenceForPage: {
          language: lang,
          primaryLanguage: primary,
          primaryPageUrl: pair.primaryPageUrl,
          title: pair.title,
          untranslatedPairCount: pairs.length,
          pairCount,
        },
      });
    }
  }
  return candidates;
}
