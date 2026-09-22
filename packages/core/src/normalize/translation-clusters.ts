/**
 * B2 (2026-08-24 three-site review): a real Haaitza audit scanned 212
 * pages, of which 165 were en/it/es/pt-pt translations of the same ~47
 * French templates, and La Corniche 157 of which 138 were. Every defect
 * in a shared template therefore arrived as one finding per language: 182
 * of that audit's 265 `link-name` findings each spanned exactly five
 * pages, and those five were always the five language variants of one
 * gallery page.
 *
 * That single fact drove most of the report's damage - a 265-entry
 * finding-id list on a priority card, a nine-page "printable" checklist,
 * and 65% of an 81-page report being annex. The client also learned
 * nothing from it: the same missing link text, restated five times.
 *
 * Clustering is done from the site's own `hreflang` declarations rather
 * than from URL shape. A site that publishes `<link rel="alternate"
 * hreflang="es" href="...">` is stating, authoritatively and in machine-
 * readable form, that two URLs are the same page in two languages -
 * exactly the fact needed here, asserted by the only party that actually
 * knows it. 209 of Haaitza's 212 pages carried it. A URL-prefix guess
 * (`/es/...`) is deliberately NOT used as a fallback: a prefix can also
 * be a country section, a category, or a customer's initials, and
 * inventing a translation relationship that the site never declared would
 * merge two genuinely different pages into one finding - the exact
 * failure mode CLAUDE.md trade-off 3 rejected selector normalization for.
 * Pages with no hreflang simply stay their own cluster of one.
 *
 * A cluster never changes what was scanned or what was found. Every page
 * is still crawled, still scanned, and every real page URL is still
 * carried on the Finding. The cluster only decides what counts as "the
 * same place" when collapsing duplicates and when counting pages for a
 * client-facing number.
 *
 * Two validity gates, both learned the hard way from the real La Corniche
 * scan. A first implementation unioned pages transitively across any
 * shared hreflang target and produced a single 55-member "cluster"
 * containing ten genuinely different room pages (banc-darguin, bassin,
 * dune, ferret, ocean...). Root cause: every individual room page copies
 * the *rooms listing page's* hreflang block verbatim, so each room
 * declares that its own English version lives at
 * /en/rooms-suites-hotel-pyla - a different page. Chaining those together
 * merged the whole room catalogue.
 *
 *   1. Self-inclusion. A declaration is only about the declaring page if
 *      one of its own hreflang hrefs resolves back to that page. This is
 *      not an Odysseus invention: a valid hreflang set is required to be
 *      self-referential, and a set that omits the page stating it is a
 *      statement about some *other* page. /en/room/banc-darguin lists
 *      five URLs, none of them itself, so it clusters with nothing.
 *
 *   2. One URL per language. A cluster claiming two different URLs for
 *      the same language is internally inconsistent and is rejected
 *      whole rather than resolved by picking one.
 *
 * When a site's own declarations disagree, the answer is no cluster, not
 * a guessed one. Over-merging silently tells a client that two different
 * pages are the same page; leaving them separate only forgoes a
 * simplification.
 */

import { languagePrefixOf } from './normalize-hreflang.js';

/** A page's declared language alternates, as read from its own head. */
export interface TranslationClusterInput {
  pageUrl: string;
  hreflangLinks: readonly { lang: string; href: string }[];
  /** Page's own language declaration, used to label a switcher-derived
   *  pair when hreflang is absent. */
  language?: string | null;
  /** Structural language-menu links, used only when hreflang is absent. */
  languageSwitcherLinks?: readonly { lang?: string; href: string }[];
}

export interface TranslationClusterMember {
  pageUrl: string;
  /** The language this page was declared as, lowercased ("fr", "pt-pt").
   *  Undefined when the page belongs to a cluster because others pointed
   *  at it but it declared no language for itself. */
  lang?: string;
}

export interface TranslationCluster {
  /** The member every count and every collapsed finding is attributed to. */
  canonicalPageUrl: string;
  members: TranslationClusterMember[];
  /** Why this multi-page cluster exists. Omitted for a singleton that has
   *  no supported relationship to another scanned page. */
  derivation?: 'hreflang' | 'language-switcher';
}

/** Trailing slash, fragment and host case are presentation differences,
 *  not different pages - a site's hreflang hrefs routinely carry a
 *  trailing slash the crawler's own URL does not (confirmed against the
 *  real Haaitza scan). Query strings are kept: `?post_type=...` is a
 *  genuinely different page. */
export function canonicalizeUrlForMatching(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/** `x-default` names the version a site serves when no language matches -
 *  the closest thing to "the original" a site actually declares, so it is
 *  the first choice of canonical member. */
const X_DEFAULT = 'x-default';

class DisjointSet {
  private readonly parent = new Map<string, string>();

  find(value: string): string {
    const seen = this.parent.get(value);
    if (seen === undefined) {
      this.parent.set(value, value);
      return value;
    }
    if (seen === value) return value;
    const root = this.find(seen);
    this.parent.set(value, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

export function buildTranslationClusters(
  pages: readonly TranslationClusterInput[],
): TranslationCluster[] {
  // Only pages that were actually scanned can join a cluster. A site
  // routinely declares alternates for URLs outside the crawl's own
  // scope (a page below the depth cap, an excluded path); counting those
  // would inflate a cluster with pages this audit never looked at.
  const scanned = new Map<string, string>();
  for (const page of pages) scanned.set(canonicalizeUrlForMatching(page.pageUrl), page.pageUrl);

  interface Proposal {
    memberKeys: string[];
    langByKey: Map<string, string>;
    xDefaultKeys: Set<string>;
    derivation: 'hreflang' | 'language-switcher';
  }

  const proposals: Proposal[] = [];
  for (const page of pages) {
    const selfKey = canonicalizeUrlForMatching(page.pageUrl);
    const langByKey = new Map<string, string>();
    const xDefaultKeys = new Set<string>();
    const memberKeys = new Set<string>();
    let declaresSelf = false;
    let inconsistent = false;

    const switcherLinks = page.languageSwitcherLinks ?? [];
    const usesSwitcherFallback = page.hreflangLinks.length === 0 && switcherLinks.length > 0;
    const links = usesSwitcherFallback ? switcherLinks : page.hreflangLinks;
    const declaredLanguage = page.language?.trim().toLowerCase();
    const sourceLanguage = declaredLanguage || languagePrefixOf(page.pageUrl)?.toLowerCase();

    for (const link of links) {
      let resolvedHref = link.href;
      try {
        resolvedHref = new URL(link.href, page.pageUrl).toString();
      } catch {
        // Keep the raw value so malformed links remain safely unscanned.
      }
      const targetKey = canonicalizeUrlForMatching(resolvedHref);
      if (!scanned.has(targetKey)) continue;
      if (targetKey === selfKey) declaresSelf = true;
      memberKeys.add(targetKey);

      const lang = (link.lang ?? '').trim().toLowerCase();
      if (!lang) continue;
      if (lang === X_DEFAULT) {
        xDefaultKeys.add(targetKey);
        continue;
      }
      // Gate 2: the same language claimed for two different URLs.
      const existing = [...langByKey.entries()].find(([, value]) => value === lang);
      if (existing && existing[0] !== targetKey) inconsistent = true;
      langByKey.set(targetKey, lang);
    }

    if (usesSwitcherFallback) {
      memberKeys.add(selfKey);
      if (sourceLanguage !== undefined && sourceLanguage !== '') {
        langByKey.set(selfKey, sourceLanguage);
      }
    }

    // Gate 1: a set that does not name the page stating it is a
    // statement about a different page, not about this one.
    if (inconsistent || (!usesSwitcherFallback && !declaresSelf) || memberKeys.size < 2) continue;
    proposals.push({
      memberKeys: [...memberKeys].sort(),
      langByKey,
      xDefaultKeys,
      derivation: usesSwitcherFallback ? 'language-switcher' : 'hreflang',
    });
  }

  const sets = new DisjointSet();
  const langByUrl = new Map<string, string>();
  const xDefaultTargets = new Set<string>();
  const languageSwitcherMembers = new Set<string>();
  for (const key of scanned.keys()) sets.find(key);

  for (const proposal of proposals) {
    const [first, ...rest] = proposal.memberKeys;
    for (const key of rest) sets.union(first!, key);
    for (const [key, lang] of proposal.langByKey) langByUrl.set(key, lang);
    for (const key of proposal.xDefaultKeys) xDefaultTargets.add(key);
    if (proposal.derivation === 'language-switcher') {
      for (const key of proposal.memberKeys) languageSwitcherMembers.add(key);
    }
  }

  const membersByRoot = new Map<string, string[]>();
  for (const key of scanned.keys()) {
    const root = sets.find(key);
    const bucket = membersByRoot.get(root);
    if (bucket) bucket.push(key);
    else membersByRoot.set(root, [key]);
  }

  const clusters: TranslationCluster[] = [];
  for (const memberKeys of membersByRoot.values()) {
    // Sorted so the canonical choice, and the member order, are stable
    // across runs - the monitoring tier compares runs by identity.
    memberKeys.sort();

    // Gate 2 again, now against the merged result: two valid proposals
    // can still union into a set that claims one language twice.
    const seenLangs = new Map<string, string>();
    let inconsistent = false;
    for (const key of memberKeys) {
      const lang = langByUrl.get(key);
      if (lang === undefined) continue;
      const previous = seenLangs.get(lang);
      if (previous !== undefined && previous !== key) inconsistent = true;
      seenLangs.set(lang, key);
    }

    const groups = inconsistent ? memberKeys.map((key) => [key]) : [memberKeys];
    for (const group of groups) {
      const canonicalKey =
        group.find((key) => xDefaultTargets.has(key)) ??
        [...group].sort((a, b) => a.length - b.length || a.localeCompare(b))[0]!;

      clusters.push({
        canonicalPageUrl: scanned.get(canonicalKey)!,
        members: group.map((key) => {
          const lang = langByUrl.get(key);
          return { pageUrl: scanned.get(key)!, ...(lang !== undefined ? { lang } : {}) };
        }),
        ...(group.length > 1
          ? {
              derivation: group.some((key) => languageSwitcherMembers.has(key))
                ? ('language-switcher' as const)
                : ('hreflang' as const),
            }
          : {}),
      });
    }
  }

  clusters.sort((a, b) => a.canonicalPageUrl.localeCompare(b.canonicalPageUrl));
  return clusters;
}

/** Flattens clusters into the lookup the normalizer and the report both
 *  need: any scanned page URL to the URL its cluster is attributed to.
 *  A URL in no cluster maps to itself. */
export function buildCanonicalPageUrlMap(
  clusters: readonly TranslationCluster[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const cluster of clusters) {
    for (const member of cluster.members) map.set(member.pageUrl, cluster.canonicalPageUrl);
  }
  return map;
}
