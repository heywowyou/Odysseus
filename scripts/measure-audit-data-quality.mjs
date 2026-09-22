#!/usr/bin/env node

/**
 * Plan 075 slice 0. Read-only measurement over stored audit directories.
 *
 * The script intentionally does not call the scanner, the network, MongoDB,
 * or any report writer. It compares the findings already stored in each
 * audit with a fresh in-memory normalizeAudit pass when the local core build
 * is available, and prints a JSON table suitable for the VPS closure note.
 * A path may be supplied as argv[2]; production defaults to /data/artifacts.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const artifactsRoot = path.resolve(
  process.argv[2] ?? process.env.ODYSSEUS_ARTIFACTS_ROOT ?? '/data/artifacts',
);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const CHALLENGE_PATTERN =
  /cloudflare|just a moment|security check|checking your browser|verify you are human|captcha|access denied|bot verification|ddos-guard/i;

function identity(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    if (url.search === '?') url.search = '';
    return url.href;
  } catch {
    return raw;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function findManifestFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await findManifestFiles(child)));
    else if (entry.isFile() && entry.name === 'manifest.json') files.push(child);
  }
  return files;
}

async function readPageScans(auditDir, manifest) {
  const scans = [];
  let missingPageScanCount = 0;
  let missingVisitedPageScanCount = 0;
  for (const page of manifest.pages ?? []) {
    if (typeof page.pageDir !== 'string') {
      missingPageScanCount += 1;
      if (page.status === undefined || page.status === 'visited') {
        missingVisitedPageScanCount += 1;
      }
      continue;
    }
    try {
      scans.push(await readJson(path.join(auditDir, page.pageDir, 'scan.json')));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      missingPageScanCount += 1;
      if (page.status === undefined || page.status === 'visited') {
        missingVisitedPageScanCount += 1;
      }
    }
  }
  return { scans, missingPageScanCount, missingVisitedPageScanCount };
}

function countByRule(findings) {
  const rules = {};
  for (const finding of findings) {
    const row = (rules[finding.ruleId] ??= { findings: 0, occurrences: 0 });
    row.findings += 1;
    row.occurrences += Number.isFinite(finding.occurrences) ? finding.occurrences : 0;
  }
  return Object.fromEntries(
    Object.entries(rules).sort(([, left], [, right]) => right.occurrences - left.occurrences),
  );
}

function findingPageUrls(findings) {
  return new Set(findings.flatMap((finding) => finding.pageUrls ?? []));
}

function pageStatusMap(manifest) {
  return new Map((manifest.pages ?? []).map((page) => [identity(page.url), page.status]));
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function qualityStats(findings, manifest, scans) {
  const statuses = pageStatusMap(manifest);
  const nonVisited = findings.filter((finding) =>
    (finding.pageUrls ?? []).some((url) => statuses.get(identity(url)) !== 'visited'),
  );
  const challengePages = [];
  for (const page of manifest.pages ?? []) {
    const scan = scans.find((candidate) => identity(candidate.url) === identity(page.url));
    const title = scan?.headMetadata?.title ?? scan?.renderDiff?.renderedTitle ?? '';
    const markers = [
      ...(scan?.renderDiff?.renderedInterstitialMarkers ?? []),
      ...(scan?.renderDiff?.rawDocument?.interstitialMarkers ?? []),
    ];
    if (page.status === 'blocked' || CHALLENGE_PATTERN.test(title) || markers.length > 0) {
      challengePages.push({ status: page.status, hasMarkers: markers.length > 0 });
    }
  }

  const lighthouseOffIdentity = [];
  const validLabValues = new Map();
  let validLabRuns = 0;
  let invalidLabRuns = 0;
  for (const page of scans) {
    const lighthouse = page.lighthouse;
    const finalUrl = lighthouse?.finalDisplayedUrl ?? lighthouse?.finalUrl;
    if (lighthouse !== undefined) {
      const hasRuntimeError = lighthouse.runtimeError !== undefined;
      const hasOffIdentityFinalUrl =
        typeof finalUrl === 'string' && identity(finalUrl) !== identity(page.url);
      if (hasRuntimeError || hasOffIdentityFinalUrl) invalidLabRuns += 1;
      else if (page.lighthouse !== undefined) {
        validLabRuns += 1;
        const manifestPage = (manifest.pages ?? []).find(
          (candidate) => identity(candidate.url) === identity(page.url),
        );
        for (const metric of ['lcp', 'cls', 'tbt', 'fcp', 'speedIndex']) {
          const value = manifestPage?.coreWebVitals?.[metric]?.numericValue;
          if (typeof value !== 'number' || !Number.isFinite(value)) continue;
          const values = validLabValues.get(metric) ?? [];
          values.push(value);
          validLabValues.set(metric, values);
        }
      }
    }
    if (typeof finalUrl === 'string' && identity(finalUrl) !== identity(page.url)) {
      lighthouseOffIdentity.push({ hasFinalUrl: true });
    }
  }

  const labFieldPlausibility = {};
  const fieldData = manifest.cruxFieldData;
  for (const metric of ['lcp', 'cls']) {
    const labMedian = median(validLabValues.get(metric) ?? []);
    const fieldValue = fieldData?.[metric]?.p75;
    if (labMedian === null || typeof fieldValue !== 'number') continue;
    const ratio = fieldValue === 0 ? null : labMedian / fieldValue;
    labFieldPlausibility[metric] = {
      labMedian,
      fieldP75: fieldValue,
      ratio,
      implausible: labMedian > 20_000 || (ratio !== null && ratio > 3),
    };
  }

  const sourceGroups = new Map();
  for (const finding of findings) {
    for (const pageUrl of finding.pageUrls ?? []) {
      const key = `${finding.ruleId}|${finding.title}|${pageUrl}`;
      const sources = sourceGroups.get(key) ?? new Set();
      sources.add(finding.source);
      sourceGroups.set(key, sources);
    }
  }
  const crossSourceDuplicatePairs = [...sourceGroups.values()].filter(
    (sources) => sources.size > 1,
  ).length;

  const splitGroups = new Map();
  for (const finding of findings) {
    const key = `${finding.ruleId}|${finding.title}|${finding.description}`;
    const group = splitGroups.get(key) ?? [];
    group.push(finding);
    splitGroups.set(key, group);
  }
  const splitCandidates = [...splitGroups.values()]
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length)
    .slice(0, 20)
    .map((group) => ({
      ruleId: group[0].ruleId,
      findingCount: group.length,
      sourceCount: new Set(group.map((finding) => finding.source)).size,
      pageCount: new Set(group.flatMap((finding) => finding.pageUrls ?? [])).size,
    }));

  const occurrences = findings.reduce(
    (total, finding) => total + (Number.isFinite(finding.occurrences) ? finding.occurrences : 0),
    0,
  );
  const topRule = Object.entries(countByRule(findings))[0];
  return {
    findings: findings.length,
    occurrences,
    topRule: topRule
      ? {
          ruleId: topRule[0],
          occurrences: topRule[1].occurrences,
          share: occurrences ? topRule[1].occurrences / occurrences : 0,
        }
      : null,
    perRule: countByRule(findings),
    findingsOnNonVisitedPages: nonVisited.length,
    nonVisitedPageUrls: [...findingPageUrls(nonVisited)].length,
    challengeOrErrorPages: challengePages.length,
    lighthouseRunsOffPageIdentity: lighthouseOffIdentity.length,
    validLabRuns,
    invalidLabRuns,
    labFieldPlausibility,
    crossSourceDuplicatePairs,
    splitCandidates,
  };
}

function normalizeInput(manifest, pages) {
  return {
    auditId: manifest.auditId,
    startedAt: new Date(manifest.startedAt),
    pages,
    ...(manifest.translationClusters !== undefined
      ? { translationClusters: manifest.translationClusters }
      : {}),
    ...(manifest.coverageLimitations !== undefined
      ? { coverageLimitations: manifest.coverageLimitations }
      : {}),
    ...(manifest.cruxFieldData !== undefined ? { cruxFieldData: manifest.cruxFieldData } : {}),
    crawl: {
      startUrl: manifest.crawl.startUrl,
      ...(manifest.crawl.homepageUrl !== undefined
        ? { homepageUrl: manifest.crawl.homepageUrl }
        : {}),
      robotsTxtFound: manifest.crawl.robotsTxtFound,
      pages: (manifest.pages ?? []).map((page) => ({
        url: page.url,
        status: page.status,
        ...(page.depth !== undefined ? { depth: page.depth } : {}),
        ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
        ...(page.discoveredFrom !== undefined ? { discoveredFrom: page.discoveredFrom } : {}),
      })),
      ...(manifest.crawl.robotsDisallowMatches !== undefined
        ? { robotsDisallowMatches: manifest.crawl.robotsDisallowMatches }
        : {}),
      ...(manifest.crawl.aiCrawlerBlocks !== undefined
        ? { aiCrawlerBlocks: manifest.crawl.aiCrawlerBlocks }
        : {}),
      ...(manifest.crawl.sitemapUrls !== undefined
        ? { sitemapUrls: manifest.crawl.sitemapUrls }
        : {}),
      ...(manifest.relativeLinkNestingSummary !== undefined
        ? { relativeLinkNestingSummary: manifest.relativeLinkNestingSummary }
        : {}),
    },
  };
}

async function main() {
  const manifestFiles = await findManifestFiles(artifactsRoot);
  if (manifestFiles.length === 0) {
    console.log(
      JSON.stringify({ artifactsRoot, audits: [], note: 'No manifest.json files found.' }, null, 2),
    );
    return;
  }

  let normalizeAudit;
  try {
    ({ normalizeAudit } = await import(
      pathToFileURL(path.join(repoRoot, 'packages/core/dist/index.js')).href
    ));
  } catch {
    // The stored-data table remains useful without a build; the after pass is
    // explicitly marked unavailable instead of silently pretending equality.
  }

  const audits = [];
  for (const manifestFile of manifestFiles.sort()) {
    const auditDir = path.dirname(manifestFile);
    const manifest = await readJson(manifestFile);
    const storedFindings = await readJson(path.join(auditDir, 'findings.json')).catch(() => []);
    const {
      scans: pages,
      missingPageScanCount,
      missingVisitedPageScanCount,
    } = await readPageScans(auditDir, manifest);
    const before = qualityStats(storedFindings, manifest, pages);
    let after = null;
    let normalizeError;
    let afterUnavailableReason;
    if (missingVisitedPageScanCount > 0) {
      afterUnavailableReason = `${missingVisitedPageScanCount} visited page scan artifact(s) missing; after-pass skipped`;
    } else if (normalizeAudit !== undefined) {
      try {
        after = qualityStats(normalizeAudit(normalizeInput(manifest, pages)), manifest, pages);
      } catch (error) {
        normalizeError = error instanceof Error ? error.message : String(error);
      }
    } else {
      afterUnavailableReason = 'local core build unavailable; after-pass skipped';
    }
    audits.push({
      audit: path.relative(artifactsRoot, auditDir),
      missingPageScanCount,
      missingVisitedPageScanCount,
      before,
      after,
      invariants: {
        occurrenceDelta: after === null ? null : after.occurrences - before.occurrences,
        occurrencesPreserved: after === null ? null : after.occurrences === before.occurrences,
        concentrationGuardGreen:
          after === null || after.topRule === null || after.topRule.share <= 0.3,
      },
      ...(normalizeError !== undefined ? { normalizeError } : {}),
      ...(afterUnavailableReason !== undefined ? { afterUnavailableReason } : {}),
    });
  }

  console.log(JSON.stringify({ artifactsRoot, audits }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
