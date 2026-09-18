/**
 * Structural anchors and the temporal-coherence verdict (plan 059 section 13).
 *
 * A full audit runs for minutes to hours, and a site can deploy in the middle
 * of it. Evidence taken before and after a deploy describes two different
 * sites, and a report built from both would describe neither. This module
 * records what the served document looked like at known instants and decides
 * whether the audit can show that all of its evidence came from one version.
 *
 * Anchors are read from the served markup with JavaScript off (the raw pass,
 * and probes taken the same way), because that is the one capture that does
 * not depend on how long a script ran. They keep structure, not copy: the
 * canonical, the document language, the heading outline, the navigation
 * targets and the versions of same-origin stylesheets and scripts. Text is
 * left out on purpose, since a date or a rotating offer would otherwise look
 * like a deployment.
 *
 * Three observations make the verdict possible:
 *   - two back-to-back probes of the start page when the crawl begins, whose
 *     disagreements mark the values this site varies per request (a cache
 *     buster, a nonce in an asset URL) so they are never read as drift;
 *   - the anchor of every scanned page, from its own raw pass;
 *   - one probe of the start page after the last acquisition phase.
 * Drift is either the start page changing across that window, or one asset
 * family served in two versions across pages, which is what a deploy between
 * two page scans leaves behind.
 */
import type { Browser } from 'playwright';
import { canonicalDigest } from '@odysseus/core';
import {
  installBrowserNetworkSafety,
  type NetworkSafetyBlockHandler,
} from './browser-network-safety.js';
import type { TemporalCoherenceResult } from './evidence-snapshots.js';
import type { NetworkTargetPolicy } from './network-target-policy.js';

const STRUCTURAL_ANCHOR_VERSION = 'structural-anchor-v1';

/** Bounds so a page with a mega-menu or hundreds of script tags cannot grow
 *  one anchor without limit. Sorted before truncation, so a bound is stable. */
const MAX_NAVIGATION_TARGETS = 200;
const MAX_ASSETS = 200;

export interface AnchorAsset {
  /** The asset with its build-specific parts replaced, so two builds of one
   *  stylesheet share a family. */
  family: string;
  /** The path and query actually served. */
  version: string;
}

export interface StructuralAnchor {
  version: typeof STRUCTURAL_ANCHOR_VERSION;
  pageUrl: string;
  capturedAt: string;
  canonical: string | null;
  lang: string | null;
  /** Heading levels in document order, e.g. `1.2.2.3`. */
  headingOutline: string;
  /** Same-origin paths linked from `<nav>` elements, sorted. */
  navigationTargets: readonly string[];
  /** Same-origin stylesheets and scripts, sorted by family then version. */
  assets: readonly AnchorAsset[];
  digest: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function decode(value: string): string {
  return value.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** Attributes of one start tag. The markup is Chromium's serialization of
 *  the parsed document, which always double-quotes attribute values. */
function attributesOf(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const body = tag.replace(/^<[a-z0-9]+/i, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(/([^\s"'=<>/]+)(?:="([^"]*)")?/g)) {
    const name = match[1]!.toLowerCase();
    if (!attributes.has(name)) attributes.set(name, decode(match[2] ?? ''));
  }
  return attributes;
}

function resolve(href: string, base: URL): URL | undefined {
  try {
    return new URL(href, base);
  } catch {
    return undefined;
  }
}

/** Replaces the parts of an asset path that change on every build: a hex
 *  content hash beside a separator (`main.3f2a1b9c.js`) or a whole segment
 *  that is a long generated identifier (a framework build id). */
export function assetFamily(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) =>
      /^[A-Za-z0-9_-]{16,}$/.test(segment) && /\d/.test(segment)
        ? '#'
        : segment.replace(/(?<=[.\-_~])[0-9a-f]{8,}(?=[.\-_~]|$)/gi, '#'),
    )
    .join('/');
}

export function extractStructuralAnchor(
  html: string,
  pageUrl: string,
  capturedAt: Date,
): StructuralAnchor {
  const base = new URL(pageUrl);
  const lang = /<html\b[^>]*>/i.exec(html)?.[0];
  let canonical: string | null = null;
  const assets = new Map<string, AnchorAsset>();
  const addAsset = (href: string | undefined) => {
    if (href === undefined || href === '') return;
    const url = resolve(href, base);
    if (url === undefined || url.origin !== base.origin) return;
    const version = `${url.pathname}${url.search}`;
    assets.set(version, { family: assetFamily(url.pathname), version });
  };

  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = attributesOf(tag);
    const rel = (attributes.get('rel') ?? '').toLowerCase().split(/\s+/);
    const href = attributes.get('href');
    if (rel.includes('canonical') && canonical === null && href !== undefined) {
      canonical = resolve(href, base)?.href ?? null;
    }
    if (rel.includes('stylesheet')) addAsset(href);
  }
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    addAsset(attributesOf(tag).get('src'));
  }

  const headingOutline = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => match[1]).join('.');

  const navigation = new Set<string>();
  for (const [, inner] of html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)) {
    for (const [tag] of inner!.matchAll(/<a\b[^>]*>/gi)) {
      const href = attributesOf(tag).get('href');
      if (href === undefined) continue;
      const url = resolve(href, base);
      if (url !== undefined && url.origin === base.origin) navigation.add(url.pathname);
    }
  }

  const body = {
    version: STRUCTURAL_ANCHOR_VERSION,
    pageUrl,
    capturedAt: capturedAt.toISOString(),
    canonical,
    lang: lang === undefined ? null : (attributesOf(lang).get('lang') ?? null),
    headingOutline,
    navigationTargets: [...navigation].sort().slice(0, MAX_NAVIGATION_TARGETS),
    assets: [...assets.values()]
      .sort((a, b) => a.family.localeCompare(b.family) || a.version.localeCompare(b.version))
      .slice(0, MAX_ASSETS),
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

export interface AnchorProbeOptions {
  userAgent: string;
  timeoutMs: number;
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: NetworkSafetyBlockHandler;
}

/**
 * Loads one page with JavaScript off, exactly as the raw pass does, and reads
 * its anchor. The caller owns pacing and robots: this is one navigation.
 */
export async function captureStructuralAnchor(
  browser: Browser,
  url: string,
  options: AnchorProbeOptions,
): Promise<StructuralAnchor> {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    userAgent: options.userAgent,
  });
  try {
    if (options.networkPolicy !== undefined) {
      await installBrowserNetworkSafety(
        context,
        options.networkPolicy,
        options.onNetworkSafetyBlocked,
      );
    }
    context.setDefaultTimeout(options.timeoutMs);
    context.setDefaultNavigationTimeout(options.timeoutMs);
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'load' });
    if (response === null) throw new Error(`anchor probe: no HTTP response for ${url}`);
    return extractStructuralAnchor(await page.content(), url, new Date());
  } finally {
    await context.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ *
 * The verdict
 * ------------------------------------------------------------------ */

export interface TemporalAnchorSet {
  /** The two back-to-back start-page probes taken when the crawl began. */
  startProbes: readonly StructuralAnchor[];
  /** The start-page probe taken after the last acquisition phase. */
  endProbe?: StructuralAnchor;
}

interface Volatility {
  components: Set<'canonical' | 'lang' | 'headingOutline' | 'navigationTargets'>;
  families: Set<string>;
}

function versionsByFamily(anchor: StructuralAnchor): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const asset of anchor.assets) {
    const set = map.get(asset.family) ?? new Set<string>();
    set.add(asset.version);
    map.set(asset.family, set);
  }
  return map;
}

function sameSet(a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/** What the site changes between two requests made seconds apart. */
function volatilityOf(first: StructuralAnchor, second: StructuralAnchor): Volatility {
  const components: Volatility['components'] = new Set();
  if (first.canonical !== second.canonical) components.add('canonical');
  if (first.lang !== second.lang) components.add('lang');
  if (first.headingOutline !== second.headingOutline) components.add('headingOutline');
  if (first.navigationTargets.join('\n') !== second.navigationTargets.join('\n')) {
    components.add('navigationTargets');
  }
  const a = versionsByFamily(first);
  const b = versionsByFamily(second);
  const families = new Set<string>();
  for (const family of new Set([...a.keys(), ...b.keys()])) {
    if (!sameSet(a.get(family), b.get(family))) families.add(family);
  }
  return { components, families };
}

/** Whether one page's structure differs between two captures, ignoring what
 *  the site varies per request anyway. */
function pageChanged(
  before: StructuralAnchor,
  after: StructuralAnchor,
  volatile: Volatility,
): boolean {
  const differs = volatilityOf(before, after);
  if ([...differs.components].some((component) => !volatile.components.has(component))) {
    return true;
  }
  return [...differs.families].some((family) => !volatile.families.has(family));
}

/**
 * The audit's temporal-coherence result. Unknown whenever the anchors needed
 * to show coherence are missing, because an absent measurement must never
 * read as a clean one.
 */
export function assessTemporalCoherence(input: {
  startUrl: string;
  anchors: TemporalAnchorSet | undefined;
  pageAnchors: readonly StructuralAnchor[];
}): TemporalCoherenceResult {
  const [first, second] = input.anchors?.startProbes ?? [];
  const end = input.anchors?.endProbe;
  if (first === undefined || second === undefined) {
    return { status: 'unknown', reasonCode: 'start-anchors-missing' };
  }
  if (end === undefined) return { status: 'unknown', reasonCode: 'end-anchor-missing' };
  if (first.pageUrl !== input.startUrl || end.pageUrl !== input.startUrl) {
    return { status: 'unknown', reasonCode: 'anchor-target-mismatch' };
  }

  const volatile = volatilityOf(first, second);
  const targets = new Set<string>();
  const refs = new Set<string>();

  // The start page across the whole window, and at its own scan.
  const startScan = input.pageAnchors.find((anchor) => anchor.pageUrl === input.startUrl);
  for (const earlier of startScan === undefined ? [first] : [first, startScan]) {
    if (pageChanged(earlier, end, volatile)) {
      targets.add(input.startUrl);
      refs.add(earlier.digest).add(end.digest);
    }
  }

  // One asset family, two versions, across pages scanned at different times.
  const observed = [first, ...input.pageAnchors, end];
  const holders = new Map<string, Map<string, StructuralAnchor[]>>();
  for (const anchor of observed) {
    for (const asset of anchor.assets) {
      if (volatile.families.has(asset.family)) continue;
      const byVersion = holders.get(asset.family) ?? new Map<string, StructuralAnchor[]>();
      const list = byVersion.get(asset.version) ?? [];
      list.push(anchor);
      byVersion.set(asset.version, list);
      holders.set(asset.family, byVersion);
    }
  }
  for (const [family, byVersion] of holders) {
    if (byVersion.size < 2) continue;
    // A page may legitimately include two builds of one family (a vendor
    // bundle next to its legacy twin); what drift leaves is pages that
    // disagree, so compare each page's own set of versions.
    const setsByPage = new Map<string, Set<string>>();
    for (const [version, anchors] of byVersion) {
      for (const anchor of anchors) {
        const key = `${anchor.pageUrl}@${anchor.capturedAt}`;
        const set = setsByPage.get(key) ?? new Set<string>();
        set.add(version);
        setsByPage.set(key, set);
      }
    }
    const reference = versionsByFamily(end).get(family) ?? versionsByFamily(first).get(family);
    const distinct = new Set([...setsByPage.values()].map((set) => [...set].sort().join('\n')));
    if (distinct.size < 2) continue;
    for (const anchor of observed) {
      const own = versionsByFamily(anchor).get(family);
      if (own === undefined) continue;
      if (reference === undefined || !sameSet(own, reference)) {
        targets.add(anchor.pageUrl);
        refs.add(anchor.digest);
      }
    }
    if (reference !== undefined) refs.add(end.digest);
  }

  if (targets.size > 0) {
    return {
      status: 'drift-detected',
      startedAt: first.capturedAt,
      finishedAt: end.capturedAt,
      materialTargets: [...targets].sort(),
      evidenceRefs: [...refs].sort(),
    };
  }
  return { status: 'coherent', startedAt: first.capturedAt, finishedAt: end.capturedAt };
}
