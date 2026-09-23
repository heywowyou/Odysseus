import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  classifyDocumentWall,
  extractHostSignalMarkers,
  isChallengeTitle,
} from '../packages/core/src/acquisition/host-signal.ts';

type JsonObject = Record<string, unknown>;

interface LabelConfig {
  version: number;
  runLabels: Record<string, 'opera-429' | 'lacoorniche-title' | 'haaitza-o2switch'>;
  defaultContent: { status: number; minimumRenderedTextLength: number };
}

interface CorpusRow {
  runKey: string;
  pageKey: string;
  manifestStatus: string | null;
  httpStatus: number | null;
  renderedHttpStatus: number | null;
  renderedTitle: string | null;
  titleHash: string | null;
  rawTextLength: number | null;
  renderedTextLength: number | null;
  rawMarkupLength: number | null;
  markerNames: string[];
  vendorHosts: {
    captchaDelivery: boolean;
    datadome: boolean;
    o2switCh: boolean;
    challengePlatform: boolean;
  };
  frameOriginsWithChallengeMarkers: Array<{ originHash: string; markers: string[] }>;
  landedHostIsAudited: boolean;
  expectedClassification?: 'wall' | 'content';
}

const ROOT = process.cwd();
const ARTIFACTS_ROOT = path.resolve(ROOT, 'artifacts');
const OUTPUT_PATH = path.resolve(ROOT, 'fixtures/pushback-corpus/corpus.json');
const LABELS_PATH = path.resolve(ROOT, 'fixtures/pushback-corpus/labels.json');

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function host(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return undefined;
  }
}

function sameAuditedHost(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  const bare = (value: string) => value.replace(/^www\./u, '');
  const aliases = (value: string) => new Set([bare(value), `www.${bare(value)}`]);
  const left = aliases(a);
  const right = aliases(b);
  return [...left].some((entry) => right.has(entry));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function evidenceStrings(scan: JsonObject): string[] {
  const evidence: string[] = [];
  const lighthouse = object(scan.lighthouse);
  const audits = object(lighthouse.audits);
  const requests = object(audits['network-requests']);
  const details = object(requests.details);
  const items = Array.isArray(details.items) ? details.items : [];
  for (const item of items) {
    const url = text(object(item).url);
    if (url !== undefined) evidence.push(url);
  }

  const axe = object(scan.axe);
  const violations = Array.isArray(axe.violations) ? axe.violations : [];
  for (const violation of violations) {
    const nodes = object(violation).nodes;
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      const html = text(object(node).html);
      if (html !== undefined) evidence.push(html);
    }
  }
  return evidence;
}

function challengeMarkersFromScan(scan: JsonObject): string[] {
  const render = object(scan.renderDiff);
  const raw = object(render.rawDocument);
  const markers = [
    ...(Array.isArray(raw.interstitialMarkers)
      ? raw.interstitialMarkers.filter((value): value is string => typeof value === 'string')
      : []),
    ...(Array.isArray(render.renderedInterstitialMarkers)
      ? render.renderedInterstitialMarkers.filter(
          (value): value is string => typeof value === 'string',
        )
      : []),
  ];
  for (const evidence of evidenceStrings(scan)) {
    markers.push(...extractHostSignalMarkers(evidence));
  }
  return uniqueSorted(markers);
}

function vendorHostFlags(scan: JsonObject): CorpusRow['vendorHosts'] {
  const joined = evidenceStrings(scan).join('\n').toLowerCase();
  return {
    captchaDelivery: joined.includes('captcha-delivery.com'),
    datadome: joined.includes('datadome'),
    o2switCh: joined.includes('o2swit.ch'),
    challengePlatform: joined.includes('challenge-platform'),
  };
}
function challengeFrames(scan: JsonObject): CorpusRow['frameOriginsWithChallengeMarkers'] {
  if (!Array.isArray(scan.frames)) return [];
  const rows: CorpusRow['frameOriginsWithChallengeMarkers'] = [];
  for (const value of scan.frames) {
    const frame = object(value);
    const origin = text(frame.frameOrigin);
    const markers = Array.isArray(frame.challengeMarkers)
      ? uniqueSorted(
          frame.challengeMarkers.filter((marker): marker is string => typeof marker === 'string'),
        )
      : [];
    if (origin === undefined || markers.length === 0) continue;
    rows.push({ originHash: hash(origin), markers });
  }
  return rows.sort((a, b) => a.originHash.localeCompare(b.originHash));
}

function labelRow(
  row: CorpusRow,
  title: string | undefined,
  runLabel: LabelConfig['runLabels'][string] | undefined,
  config: LabelConfig,
): CorpusRow['expectedClassification'] {
  if (runLabel === 'opera-429' && row.httpStatus === 429) return 'wall';
  if (runLabel === 'lacoorniche-title' && title !== undefined && isChallengeTitle(title))
    return 'wall';
  if (runLabel === 'haaitza-o2switch' && row.markerNames.includes('o2switch-challenge')) {
    const status = row.renderedHttpStatus ?? row.httpStatus;
    const visibleTextLength = row.renderedTextLength ?? row.rawTextLength;
    const document = classifyDocumentWall({
      ...(status !== null ? { status } : {}),
      ...(visibleTextLength !== null ? { visibleTextLength } : {}),
      ...(row.rawMarkupLength !== null ? { markupLength: row.rawMarkupLength } : {}),
      markers: row.markerNames,
    });
    if (document.classification === 'wall') return 'wall';
  }
  const effectiveStatus = row.renderedHttpStatus ?? row.httpStatus;
  if (
    effectiveStatus === config.defaultContent.status &&
    row.renderedTextLength !== null &&
    row.renderedTextLength >= config.defaultContent.minimumRenderedTextLength
  ) {
    return 'content';
  }
  return undefined;
}

async function findManifests(): Promise<string[]> {
  const domains = await readdir(ARTIFACTS_ROOT, { withFileTypes: true });
  const manifests: string[] = [];
  for (const domain of domains) {
    if (!domain.isDirectory()) continue;
    const runsPath = path.join(ARTIFACTS_ROOT, domain.name);
    const runs = await readdir(runsPath, { withFileTypes: true });
    for (const run of runs) {
      if (!run.isDirectory()) continue;
      const manifestPath = path.join(runsPath, run.name, 'manifest.json');
      try {
        await readFile(manifestPath);
        manifests.push(manifestPath);
      } catch {
        // Ignore directories that are not completed audit artifacts.
      }
    }
  }
  return manifests.sort();
}

async function main(): Promise<void> {
  const labels = JSON.parse(await readFile(LABELS_PATH, 'utf8')) as LabelConfig;
  const rows: CorpusRow[] = [];
  const uncovered: Array<{
    runKey: string;
    pageKey: string;
    status: number | null;
    textLength: number | null;
  }> = [];

  for (const manifestPath of await findManifests()) {
    const runDir = path.dirname(manifestPath);
    const manifest = object(JSON.parse(await readFile(manifestPath, 'utf8')));
    const siteHost = host(text(manifest.siteUrl));
    const runKey = hash(`${siteHost ?? 'unknown'}|${String(manifest.startedAt ?? '')}`);
    const pages = Array.isArray(manifest.pages) ? manifest.pages : [];

    for (const value of pages) {
      const page = object(value);
      const pageUrl = text(page.url);
      const pageDir = text(page.pageDir);
      if (pageUrl === undefined || pageDir === undefined) continue;
      let scan: JsonObject;
      try {
        scan = object(JSON.parse(await readFile(path.join(runDir, pageDir, 'scan.json'), 'utf8')));
      } catch {
        continue;
      }

      const render = object(scan.renderDiff);
      const rawDocument = object(render.rawDocument);
      const renderedTitle = text(render.renderedTitle) ?? text(object(scan.headMetadata).title);
      const markers = challengeMarkersFromScan(scan);
      const vendors = vendorHostFlags(scan);
      const renderedLandedUrl = text(render.renderedLandedUrl);
      const row: CorpusRow = {
        runKey,
        pageKey: hash(pageUrl),
        manifestStatus: text(page.status) ?? null,
        httpStatus: number(render.httpStatus) ?? number(page.httpStatus) ?? null,
        renderedHttpStatus: number(render.renderedHttpStatus) ?? null,
        renderedTitle:
          renderedTitle !== undefined && isChallengeTitle(renderedTitle) ? renderedTitle : null,
        titleHash:
          renderedTitle !== undefined && !isChallengeTitle(renderedTitle)
            ? hash(renderedTitle)
            : null,
        rawTextLength: number(render.rawTextLength) ?? null,
        renderedTextLength: number(render.renderedTextLength) ?? null,
        rawMarkupLength: number(rawDocument.markupLength) ?? null,
        markerNames: markers,
        vendorHosts: vendors,
        frameOriginsWithChallengeMarkers: challengeFrames(scan),
        landedHostIsAudited: sameAuditedHost(siteHost, host(renderedLandedUrl)),
      };
      const titleIsKnownChallenge = renderedTitle !== undefined && isChallengeTitle(renderedTitle);
      const expected = labelRow(
        row,
        titleIsKnownChallenge ? renderedTitle : undefined,
        labels.runLabels[runKey],
        labels,
      );
      if (expected !== undefined) row.expectedClassification = expected;
      else {
        uncovered.push({
          runKey,
          pageKey: row.pageKey,
          status: row.renderedHttpStatus ?? row.httpStatus,
          textLength: row.renderedTextLength,
        });
      }
      rows.push(row);
    }
  }

  rows.sort((a, b) => a.runKey.localeCompare(b.runKey) || a.pageKey.localeCompare(b.pageKey));
  await writeFile(OUTPUT_PATH, `${JSON.stringify({ version: 1, rows }, null, 2)}\n`);
  console.log(
    `Wrote ${rows.length} de-identified page rows from ${new Set(rows.map((row) => row.runKey)).size} audits.`,
  );
  console.log(`Labeled ${rows.length - uncovered.length}; uncovered ${uncovered.length}.`);
  for (const row of uncovered) {
    console.log(
      `unlabeled run=${row.runKey} page=${row.pageKey} status=${row.status ?? 'unset'} renderedTextLength=${row.textLength ?? 'unset'}`,
    );
  }
}

await main();
