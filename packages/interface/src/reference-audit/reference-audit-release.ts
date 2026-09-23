import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  NORMALIZATION_FINGERPRINT,
  buildFindingsProvenance,
  type AuditManifest,
  type Finding,
} from '@odysseus/core';
import {
  assertReferenceAuditNoLeaks,
  buildReferenceAuditShowcase,
  generateReferenceAuditPdf,
  renderReferenceAuditHtml,
  REFERENCE_AUDIT_ANONYMIZER_VERSION,
  REFERENCE_AUDIT_RELEASE_VERSION,
  REPORT_TEMPLATE_VERSION,
  type ReferenceAuditSource,
} from '@odysseus/report';
import { readOdysseusBuildId } from '@odysseus/scanner';
import { resolveSelectedAnalysisPairForAudit } from '@odysseus/store';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { resolveRenderInputs } from '../pipeline/build-render-bundle.js';
import {
  publishReferenceAudit,
  ReferenceAuditPublicationError,
  type PublishReferenceAuditResult,
  type ReferenceAuditObjectStore,
} from './reference-audit-publication.js';

/** Everything the public manifest records about a candidate, captured at
 * build time so a later publish describes the PDF that was reviewed rather
 * than whatever the code looks like when the operator publishes it. */
export interface ReferenceAuditCandidateRelease {
  pdfSha256: string;
  pageCount: number;
  renderedAt: string;
  rendererBuild: string;
  reportTemplateVersion: number;
  dataVersion: string;
  anonymizerVersion: string;
  referenceReleaseVersion: string;
}

export interface BuildReferenceAuditCandidateInput extends ReferenceAuditSource {
  renderedAt?: Date;
  rendererBuild?: string;
}

export interface BuildReferenceAuditCandidateResult {
  release: ReferenceAuditCandidateRelease;
  html: string;
  pdf: Uint8Array;
  showcase: ReturnType<typeof buildReferenceAuditShowcase>;
}

export interface BuildReferenceAuditReleaseInput extends BuildReferenceAuditCandidateInput {
  store: ReferenceAuditObjectStore;
}

export interface BuildReferenceAuditReleaseResult extends BuildReferenceAuditCandidateResult {
  publication: PublishReferenceAuditResult;
  pageCount: number;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Build one detached French showcase and its PDF without publishing it. The
 * function accepts a prepared source bundle so source selection remains an
 * operator decision; it never rescans or asks the LLM for another analysis. */
export async function buildReferenceAuditCandidate(
  input: BuildReferenceAuditCandidateInput,
): Promise<BuildReferenceAuditCandidateResult> {
  if (input.analysis.language !== 'fr') {
    throw new Error('reference audit publication requires the French analysis');
  }
  const renderedAt = input.renderedAt ?? new Date();
  const showcase = buildReferenceAuditShowcase({
    // The example is dated the day it is rendered, so its audit date, render
    // date and legal "in force since" sentence all agree.
    showcaseDate: new Date(`${renderedAt.toISOString().slice(0, 10)}T00:00:00.000Z`),
    manifest: input.manifest,
    findings: input.findings,
    analysis: input.analysis,
    ...(input.renderInputs === undefined ? {} : { renderInputs: input.renderInputs }),
  });
  const rendererBuild = input.rendererBuild ?? readOdysseusBuildId();
  const renderOptions = { renderedAt, rendererBuild, reportId: 'reference-audit' };
  const html = await renderReferenceAuditHtml(showcase, renderOptions);
  assertReferenceAuditNoLeaks({
    showcaseJson: showcase.bundle,
    html,
    denylist: showcase.sourceDenylist,
  });
  const rendered = await generateReferenceAuditPdf(showcase, renderOptions);
  // A raw PDF scan is a useful additional tripwire for plain-text metadata or
  // uncompressed object names; the HTML scan remains the authoritative
  // content check because PDF streams may be compressed.
  assertReferenceAuditNoLeaks({
    pdfText: Buffer.from(rendered.pdf).toString('latin1'),
    denylist: showcase.sourceDenylist,
  });
  return {
    release: {
      pdfSha256: sha256(rendered.pdf),
      pageCount: rendered.pageCount,
      renderedAt: renderedAt.toISOString(),
      rendererBuild,
      reportTemplateVersion: REPORT_TEMPLATE_VERSION,
      dataVersion: NORMALIZATION_FINGERPRINT,
      anonymizerVersion: REFERENCE_AUDIT_ANONYMIZER_VERSION,
      referenceReleaseVersion: REFERENCE_AUDIT_RELEASE_VERSION,
    },
    html,
    pdf: rendered.pdf,
    showcase,
  };
}

/** Publish a candidate the operator has already reviewed. The PDF must still
 * match the digest recorded at build time, and the candidate must have been
 * built by the versions now running: publishing an older candidate would put
 * a pointer online that the freshness check immediately reports as stale. */
export async function publishReferenceAuditCandidate(
  store: ReferenceAuditObjectStore,
  candidate: { pdf: Uint8Array; release: ReferenceAuditCandidateRelease },
): Promise<PublishReferenceAuditResult> {
  const { pdf, release } = candidate;
  if (sha256(pdf) !== release.pdfSha256) {
    throw new ReferenceAuditPublicationError(
      'reference candidate PDF no longer matches the digest recorded when it was built',
    );
  }
  const outdated = [
    release.reportTemplateVersion !== REPORT_TEMPLATE_VERSION ? 'report template' : null,
    release.dataVersion !== NORMALIZATION_FINGERPRINT ? 'data version' : null,
    release.anonymizerVersion !== REFERENCE_AUDIT_ANONYMIZER_VERSION ? 'anonymizer' : null,
  ].filter((label): label is string => label !== null);
  if (outdated.length > 0) {
    throw new ReferenceAuditPublicationError(
      `reference candidate was built with an outdated ${outdated.join(', ')}; rebuild and review it again`,
    );
  }
  return publishReferenceAudit(store, {
    pdf,
    pageCount: release.pageCount,
    rendererBuild: release.rendererBuild,
    reportTemplateVersion: release.reportTemplateVersion,
    dataVersion: release.dataVersion,
    anonymizerVersion: release.anonymizerVersion,
    referenceReleaseVersion: release.referenceReleaseVersion,
    publishedAt: new Date(),
  });
}

/** Build and publish in one step, for callers that have no review gap. */
export async function buildAndPublishReferenceAuditRelease(
  input: BuildReferenceAuditReleaseInput,
): Promise<BuildReferenceAuditReleaseResult> {
  const built = await buildReferenceAuditCandidate(input);
  const publication = await publishReferenceAuditCandidate(input.store, built);
  return { ...built, publication, pageCount: built.release.pageCount };
}

/** Assemble a reference source from one stored audit exactly as a paid
 * report regeneration would: findings from disk, the audit's selected French
 * analysis, and render inputs through the shared resolver. */
export async function loadReferenceAuditSource(
  connection: Connection,
  auditDir: string,
): Promise<ReferenceAuditSource> {
  const manifest = JSON.parse(
    await fs.readFile(path.join(auditDir, 'manifest.json'), 'utf-8'),
  ) as AuditManifest;
  const findings = JSON.parse(
    await fs.readFile(path.join(auditDir, 'findings.json'), 'utf-8'),
  ) as Finding[];
  const resolution = await resolveSelectedAnalysisPairForAudit(connection, manifest.auditId);
  if (resolution.kind === 'none') {
    throw new Error(
      `No French analysis is selected for audit ${manifest.auditId} (${resolution.reason}). ` +
        'Write and approve its report first.',
    );
  }
  const analysis = { ...resolution.fr };
  const renderInputs = await resolveRenderInputs({
    connection,
    auditDir,
    manifest,
    findings,
    analysis,
    findingsProvenance: buildFindingsProvenance(findings),
    artifactStore: createConfiguredArtifactStore(),
  });
  return { manifest, findings, analysis, renderInputs };
}
