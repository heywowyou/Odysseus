import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import {
  buildHotelEvidenceSummaries,
  finalizeHotelPrescanEvidence,
  rankHotelSpecificFailures,
  selectHotelRenderEvidence,
  type HotelEvidenceAsset,
  type HotelEvidenceFact,
  type HotelPrescanEvidence,
} from '@odysseus/core';
import type { PrescanPageResult } from '../prescan-site.js';
import { promoteEvidencePng, prunePrescanCaptureFiles, writeExpiryManifest } from './artifacts.js';
import type { CapturedFailureCandidate } from './capture.js';
import { composeRenderComparison, constrainPng } from './image.js';

export interface PrescanEvidencePage {
  result: PrescanPageResult;
  facts: HotelEvidenceFact[];
  failureCapture: CapturedFailureCandidate | null;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;

function retainedRefs(evidence: HotelPrescanEvidence): string[] {
  return [evidence.renderComparison, evidence.specificFailure].flatMap((asset) =>
    asset.state === 'captured' ? [asset.ref] : [],
  );
}

function renderAltText(): { fr: string; en: string } {
  return {
    fr: 'Comparaison du contenu sans JavaScript et après rendu dans le navigateur.',
    en: 'Comparison of content without JavaScript and after browser rendering.',
  };
}

function failureAltText(fact: CapturedFailureCandidate['fact']): { fr: string; en: string } {
  const criteria = fact.wcagCriteria.length > 0 ? ` WCAG ${fact.wcagCriteria.join(', ')}` : '';
  return {
    fr: `Extrait annoté d'un échec mesuré.${criteria}`,
    en: `Annotated crop of a measured failure.${criteria}`,
  };
}

async function buildRenderAsset(
  browser: Browser,
  prescanDir: string,
  pages: readonly PrescanEvidencePage[],
  facts: readonly HotelEvidenceFact[],
): Promise<HotelEvidenceAsset> {
  const selected = selectHotelRenderEvidence(facts);
  if (selected === null) return { state: 'omitted', reason: 'no-material-render-gap' };
  const page = pages.find(
    (candidate) =>
      candidate.result.role === selected.pageRole && candidate.result.url === selected.pageUrl,
  );
  const rawRef = page?.result.rawScreenshotRef;
  const renderedRef = page?.result.renderedScreenshotRef;
  if (rawRef === undefined || renderedRef === undefined) {
    return { state: 'omitted', reason: 'source-screenshot-missing' };
  }
  let raw: Buffer;
  let rendered: Buffer;
  try {
    [raw, rendered] = await Promise.all([
      fs.readFile(path.join(prescanDir, rawRef)),
      fs.readFile(path.join(prescanDir, renderedRef)),
    ]);
  } catch {
    return { state: 'omitted', reason: 'source-screenshot-missing' };
  }
  try {
    const composite = await composeRenderComparison(browser, raw, rendered);
    const bounded = await constrainPng(browser, composite.bytes, {
      maxWidth: 1200,
      maxHeight: 900,
      maxBytes: 1024 * 1024,
      minWidth: 480,
      minHeight: 160,
    });
    if (bounded === null) return { state: 'omitted', reason: 'image-too-large' };
    return await promoteEvidencePng(prescanDir, bounded, {
      pageRole: selected.pageRole,
      factRef: selected.factRef,
      altText: renderAltText(),
      selectionReason: 'material-render-gap',
    });
  } catch {
    return { state: 'omitted', reason: 'capture-failed' };
  }
}

function selectFailureCapture(
  pages: readonly PrescanEvidencePage[],
): CapturedFailureCandidate | null {
  const captured = pages.flatMap((page) =>
    page.failureCapture === null ? [] : [page.failureCapture],
  );
  if (captured.length === 0) return null;
  const order = new Map(
    rankHotelSpecificFailures(captured.map((candidate) => candidate.fact)).map((fact, index) => [
      fact.factRef,
      index,
    ]),
  );
  captured.sort(
    (a, b) =>
      (order.get(a.fact.factRef) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.fact.factRef) ?? Number.MAX_SAFE_INTEGER),
  );
  return captured[0] ?? null;
}

async function buildFailureAsset(
  prescanDir: string,
  pages: readonly PrescanEvidencePage[],
  facts: readonly HotelEvidenceFact[],
): Promise<HotelEvidenceAsset> {
  const eligible = rankHotelSpecificFailures(facts);
  if (eligible.length === 0) return { state: 'omitted', reason: 'no-eligible-failure' };
  const captured = selectFailureCapture(pages);
  if (captured === null) return { state: 'omitted', reason: 'target-unresolved' };
  try {
    return await promoteEvidencePng(prescanDir, captured, {
      pageRole: captured.fact.pageRole,
      factRef: captured.fact.factRef,
      altText: failureAltText(captured.fact),
      selectionReason: captured.fact.selectionReason,
    });
  } catch {
    return { state: 'omitted', reason: 'capture-failed' };
  }
}

export async function buildPrescanEvidence(input: {
  browser: Browser;
  prescanDir: string;
  pages: readonly PrescanEvidencePage[];
  startedAt: Date;
}): Promise<HotelPrescanEvidence> {
  const facts = input.pages.flatMap((page) => page.facts);
  const renderComparison = await buildRenderAsset(
    input.browser,
    input.prescanDir,
    input.pages,
    facts,
  );
  const specificFailure = await buildFailureAsset(input.prescanDir, input.pages, facts);
  const evidence = finalizeHotelPrescanEvidence({
    renderComparison,
    specificFailure,
    summaries: buildHotelEvidenceSummaries(facts),
  });
  const refs = retainedRefs(evidence);
  await writeExpiryManifest(
    input.prescanDir,
    new Date(input.startedAt.getTime() + NINETY_DAYS_MS),
    refs,
  );
  await prunePrescanCaptureFiles(input.prescanDir, refs);
  return evidence;
}
