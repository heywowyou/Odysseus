import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import {
  REFERENCE_AUDIT_ANONYMIZER_VERSION,
  REFERENCE_AUDIT_RELEASE_VERSION,
  REPORT_TEMPLATE_VERSION,
} from '@odysseus/report';
import {
  createInMemoryReferenceAuditObjectStore,
  readCurrentReferenceAudit,
} from './reference-audit-publication.js';
import {
  publishReferenceAuditCandidate,
  type ReferenceAuditCandidateRelease,
} from './reference-audit-release.js';

const pdf = new TextEncoder().encode('reviewed candidate');

function releaseFor(bytes: Uint8Array): ReferenceAuditCandidateRelease {
  return {
    pdfSha256: createHash('sha256').update(bytes).digest('hex'),
    pageCount: 43,
    renderedAt: '2026-09-21T10:00:00.000Z',
    rendererBuild: 'renderer-test',
    reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    dataVersion: NORMALIZATION_FINGERPRINT,
    anonymizerVersion: REFERENCE_AUDIT_ANONYMIZER_VERSION,
    referenceReleaseVersion: REFERENCE_AUDIT_RELEASE_VERSION,
  };
}

describe('publishing a reviewed reference candidate', () => {
  it('publishes the reviewed PDF with the versions recorded at build time', async () => {
    const store = createInMemoryReferenceAuditObjectStore();
    const release = releaseFor(pdf);

    const result = await publishReferenceAuditCandidate(store, { pdf, release });

    expect(result.manifest.pdfSha256).toBe(release.pdfSha256);
    expect(result.manifest.reportTemplateVersion).toBe(REPORT_TEMPLATE_VERSION);
    expect(result.manifest.rendererBuild).toBe('renderer-test');
    const current = await readCurrentReferenceAudit(store);
    expect(current?.pdf).toEqual(pdf);
  });

  it('refuses a PDF changed after it was built and leaves the pointer alone', async () => {
    const store = createInMemoryReferenceAuditObjectStore();
    const release = releaseFor(pdf);

    await expect(
      publishReferenceAuditCandidate(store, {
        pdf: new TextEncoder().encode('edited after review'),
        release,
      }),
    ).rejects.toThrow(/no longer matches/u);
    expect(await readCurrentReferenceAudit(store)).toBeNull();
  });

  it('refuses a candidate built with an older report template', async () => {
    const store = createInMemoryReferenceAuditObjectStore();
    const release = { ...releaseFor(pdf), reportTemplateVersion: REPORT_TEMPLATE_VERSION - 1 };

    await expect(publishReferenceAuditCandidate(store, { pdf, release })).rejects.toThrow(
      /outdated report template/u,
    );
    expect(await readCurrentReferenceAudit(store)).toBeNull();
  });
});
