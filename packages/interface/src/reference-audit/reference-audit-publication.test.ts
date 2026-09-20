import { describe, expect, it } from 'vitest';
import {
  REFERENCE_AUDIT_CURRENT_KEY,
  createInMemoryReferenceAuditObjectStore,
  publishReferenceAudit,
  readCurrentReferenceAudit,
  rollbackReferenceAudit,
} from './reference-audit-publication.js';

const base = {
  pageCount: 18,
  rendererBuild: 'renderer-071',
  reportTemplateVersion: 3,
  dataVersion: 'normalization-v1',
  anonymizerVersion: 'reference-anonymizer-v1',
  referenceReleaseVersion: 'reference-release-v1',
  publishedAt: new Date('2026-09-20T10:00:00.000Z'),
};

describe('reference audit immutable publication', () => {
  it('uploads the digest-addressed PDF before moving the current pointer', async () => {
    const store = createInMemoryReferenceAuditObjectStore();
    const first = await publishReferenceAudit(store, {
      ...base,
      pdf: new TextEncoder().encode('pdf-n'),
    });
    const second = await publishReferenceAudit(store, {
      ...base,
      pdf: new TextEncoder().encode('pdf-n+1'),
      referenceReleaseVersion: 'reference-release-v2',
    });

    expect(first.previousManifest).toBeNull();
    expect(second.previousManifest?.referenceReleaseVersion).toBe('reference-release-v1');
    expect(store.keys()).toContain(REFERENCE_AUDIT_CURRENT_KEY);
    expect(store.keys().filter((key) => key.endsWith('.pdf'))).toHaveLength(2);
    const current = await readCurrentReferenceAudit(store);
    expect(current?.manifest.referenceReleaseVersion).toBe('reference-release-v2');
    expect(current).not.toBeNull();
    expect(new TextDecoder().decode(current!.pdf)).toBe('pdf-n+1');
  });

  it('leaves the old pointer in place when the pointer write fails', async () => {
    const store = createInMemoryReferenceAuditObjectStore();
    await publishReferenceAudit(store, { ...base, pdf: new TextEncoder().encode('stable') });
    const originalPut = store.putObject.bind(store);
    store.putObject = async (input) => {
      if (input.key === REFERENCE_AUDIT_CURRENT_KEY) throw new Error('pointer unavailable');
      return originalPut(input);
    };

    await expect(
      publishReferenceAudit(store, {
        ...base,
        pdf: new TextEncoder().encode('candidate'),
        referenceReleaseVersion: 'reference-release-v2',
      }),
    ).rejects.toThrow('pointer unavailable');
    const current = await readCurrentReferenceAudit(store);
    expect(current?.manifest.referenceReleaseVersion).toBe('reference-release-v1');
  });

  it('rolls back to the immediately previous immutable version', async () => {
    const store = createInMemoryReferenceAuditObjectStore();
    const first = await publishReferenceAudit(store, {
      ...base,
      pdf: new TextEncoder().encode('old'),
    });
    await publishReferenceAudit(store, {
      ...base,
      pdf: new TextEncoder().encode('new'),
      referenceReleaseVersion: 'reference-release-v2',
    });
    await rollbackReferenceAudit(store, first.manifest);
    const current = await readCurrentReferenceAudit(store);
    expect(current?.manifest.referenceReleaseVersion).toBe('reference-release-v1');
    expect(current).not.toBeNull();
    expect(new TextDecoder().decode(current!.pdf)).toBe('old');
  });
});
