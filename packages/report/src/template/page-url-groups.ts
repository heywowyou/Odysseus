/**
 * B2 (2026-08-24 three-site review). A finding that hit the same shared
 * template in five languages used to print five near-identical URLs:
 *
 *   Pages : .../galerie-hotel-de-luxe-pyla, .../en/photo-gallery-...,
 *           .../es/galera, .../it/la-galleria, .../pt-pt/a-galeria
 *
 * which tells a client nothing the first URL did not, and consumed the
 * five-entry PAGE_URL_LIST_CAP on one page. Normalization now collapses
 * those into a single finding (core's translation-clusters.ts), but the
 * finding still legitimately carries every real URL it was seen on, so
 * the *presentation* has to do the grouping too:
 *
 *   Pages : .../galerie-hotel-de-luxe-pyla (fr, en, es, it, pt-pt)
 *
 * A page belonging to no multi-language cluster is printed exactly as
 * before. A cluster only partially represented in a finding's pages is
 * still grouped, but only over the members actually affected - stating
 * "and its es version" for a page the scan never flagged would be
 * reporting a defect that was not found there.
 */

import type { AuditManifest, TranslationCluster } from '@odysseus/core';

export interface PageUrlDisplayGroup {
  /** The URL printed for this group. */
  pageUrl: string;
  /** Language codes of the affected members, canonical first, then
   *  alphabetical. Empty when this is an ordinary single page. */
  languages: string[];
}

export interface ClusterLookup {
  canonicalByPageUrl: ReadonlyMap<string, string>;
  clusterByCanonical: ReadonlyMap<string, TranslationCluster>;
}

export function buildClusterLookup(manifest: AuditManifest): ClusterLookup {
  const canonicalByPageUrl = new Map<string, string>();
  const clusterByCanonical = new Map<string, TranslationCluster>();
  for (const cluster of manifest.translationClusters ?? []) {
    // A cluster of one is not a translation relationship; skipping it
    // here keeps every downstream branch on the "ordinary page" path.
    if (cluster.members.length < 2) continue;
    clusterByCanonical.set(cluster.canonicalPageUrl, cluster);
    for (const member of cluster.members)
      canonicalByPageUrl.set(member.pageUrl, cluster.canonicalPageUrl);
  }
  return { canonicalByPageUrl, clusterByCanonical };
}

export function groupPageUrlsByTranslation(
  pageUrls: readonly string[],
  lookup: ClusterLookup,
): PageUrlDisplayGroup[] {
  const affectedByCanonical = new Map<string, Set<string>>();
  const ungrouped: string[] = [];

  for (const pageUrl of pageUrls) {
    const canonical = lookup.canonicalByPageUrl.get(pageUrl);
    if (canonical === undefined) {
      ungrouped.push(pageUrl);
      continue;
    }
    const bucket = affectedByCanonical.get(canonical);
    if (bucket) bucket.add(pageUrl);
    else affectedByCanonical.set(canonical, new Set([pageUrl]));
  }

  const groups: PageUrlDisplayGroup[] = [];
  for (const [canonical, affected] of affectedByCanonical) {
    const cluster = lookup.clusterByCanonical.get(canonical)!;
    // Only one variant affected: nothing to group, and printing the
    // canonical URL would name a page this finding was not seen on.
    if (affected.size < 2) {
      for (const pageUrl of affected) ungrouped.push(pageUrl);
      continue;
    }

    const langByUrl = new Map(cluster.members.map((m) => [m.pageUrl, m.lang]));
    // The canonical page may itself be unaffected while several of its
    // translations are; name and lead with a page that was actually
    // flagged, never one this finding was not seen on.
    const displayUrl = affected.has(canonical) ? canonical : [...affected].sort()[0]!;
    const displayLang = langByUrl.get(displayUrl);
    const others = [...affected]
      .filter((url) => url !== displayUrl)
      .map((url) => langByUrl.get(url))
      .filter((lang): lang is string => lang !== undefined)
      .sort();

    const languages = [...(displayLang !== undefined ? [displayLang] : []), ...others];
    // A group whose members declared no language at all would print an
    // empty parenthetical; fall back to listing the URLs plainly.
    if (languages.length < 2) {
      for (const pageUrl of affected) ungrouped.push(pageUrl);
      continue;
    }

    groups.push({ pageUrl: displayUrl, languages });
  }

  for (const pageUrl of ungrouped) groups.push({ pageUrl, languages: [] });
  groups.sort((a, b) => a.pageUrl.localeCompare(b.pageUrl));
  return groups;
}

/** The count a client-facing "N pages" figure should use once variants
 *  are grouped: one per translation group, plus every ungrouped page. */
export function countDistinctPlaces(pageUrls: readonly string[], lookup: ClusterLookup): number {
  return groupPageUrlsByTranslation(pageUrls, lookup).length;
}
