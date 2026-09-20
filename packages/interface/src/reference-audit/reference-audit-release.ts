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
import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import { readOdysseusBuildId } from '@odysseus/scanner';
import {
  publishReferenceAudit,
  type PublishReferenceAuditResult,
  type ReferenceAuditObjectStore,
} from './reference-audit-publication.js';

export interface BuildReferenceAuditReleaseInput extends ReferenceAuditSource {
  store: ReferenceAuditObjectStore;
  renderedAt?: Date;
  rendererBuild?: string;
}

export interface BuildReferenceAuditReleaseResult {
  publication: PublishReferenceAuditResult;
  html: string;
  pdf: Uint8Array;
  pageCount: number;
  showcase: ReturnType<typeof buildReferenceAuditShowcase>;
}

/** Build and publish one detached French showcase. The function accepts a
 * prepared source bundle so source selection remains an operator decision;
 * it never rescans or asks the LLM for another analysis. */
export async function buildAndPublishReferenceAuditRelease(
  input: BuildReferenceAuditReleaseInput,
): Promise<BuildReferenceAuditReleaseResult> {
  if (input.analysis.language !== 'fr') {
    throw new Error('reference audit publication requires the French analysis');
  }
  const showcase = buildReferenceAuditShowcase({
    manifest: input.manifest,
    findings: input.findings,
    analysis: input.analysis,
    ...(input.renderInputs === undefined ? {} : { renderInputs: input.renderInputs }),
  });
  const renderedAt = input.renderedAt ?? new Date();
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
  const publication = await publishReferenceAudit(input.store, {
    pdf: rendered.pdf,
    pageCount: rendered.pageCount,
    rendererBuild,
    reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    dataVersion: NORMALIZATION_FINGERPRINT,
    anonymizerVersion: REFERENCE_AUDIT_ANONYMIZER_VERSION,
    referenceReleaseVersion: REFERENCE_AUDIT_RELEASE_VERSION,
    publishedAt: renderedAt,
  });
  return {
    publication,
    html,
    pdf: rendered.pdf,
    pageCount: rendered.pageCount,
    showcase,
  };
}
