import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Sha256Digest } from '@odysseus/core';
import { bytesDigest, canonicalJson, reportQualityDigest } from '@odysseus/report';
import { InMemoryArtifactStore } from './report-quality-pipeline.fixtures.js';
import {
  promoteContentAddressedPdf,
  putImmutableJson,
  putPrivateCandidatePdf,
  readVerifiedImmutablePdf,
} from './report-quality-storage.js';

/**
 * Fail-closed proofs for the report-quality artifact storage seam: every
 * write is content-addressed and verified by read-back, and every read
 * refuses missing or changed bytes. The in-memory ArtifactStore double from
 * the pipeline fixtures stands in for the real object store.
 */

const hex = (digest: Sha256Digest) => digest.slice('sha256:'.length);

const sha256 = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}` as Sha256Digest;

/** A store whose puts silently corrupt one byte: the read-back verification
 *  in report-quality-storage.ts must catch it. */
class CorruptingArtifactStore extends InMemoryArtifactStore {
  override async put(key: string, bytes: Buffer): Promise<void> {
    const corrupted = Buffer.from(bytes);
    corrupted[0] = corrupted[0] === 0x78 ? 0x79 : 0x78;
    await super.put(key, corrupted);
  }
}

describe('putImmutableJson', () => {
  it('is content-addressed: equal objects map to one digest-derived key and rewriting is idempotent', async () => {
    const store = new InMemoryArtifactStore();
    const value = { b: 2, a: ['identique', true, null] };

    const first = await putImmutableJson(store, 'plans', value);
    const second = await putImmutableJson(store, 'plans', value);

    expect(second).toEqual(first);
    expect(first.digest).toBe(reportQualityDigest(value));
    expect(first.key).toBe(`report-quality/objects/plans/${hex(first.digest)}.json`);
    const stored = await store.get(first.key);
    expect(stored?.toString('utf8')).toBe(canonicalJson(value));
    expect(await store.list('report-quality/objects/plans/')).toHaveLength(1);
  });

  it('different content lands on a different content-derived key and both objects coexist', async () => {
    const store = new InMemoryArtifactStore();
    const left = await putImmutableJson(store, 'plans', { revision: 1 });
    const right = await putImmutableJson(store, 'plans', { revision: 2 });

    expect(left.key).not.toBe(right.key);
    expect(left.digest).not.toBe(right.digest);
    expect(await store.list('report-quality/objects/plans/')).toHaveLength(2);
  });

  it('refuses a collision when the key already holds different bytes', async () => {
    const store = new InMemoryArtifactStore();
    const value = { revision: 1 };
    const { key } = await putImmutableJson(store, 'plans', value);
    await store.put(key, Buffer.from('tampered-by-an-attacker'));

    await expect(putImmutableJson(store, 'plans', value)).rejects.toThrow(
      'Immutable object collision',
    );
  });
});

describe('putPrivateCandidatePdf', () => {
  it('stores the candidate under its content-derived private key and the read-back matches byte for byte', async () => {
    const store = new InMemoryArtifactStore();
    const pdf = Buffer.from('candidate-pdf-bytes-fr');

    const { digest, key } = await putPrivateCandidatePdf(store, {
      auditId: 'audit-1',
      qualityRunId: 'run-1',
      language: 'fr',
      pdf,
    });

    expect(digest).toBe(bytesDigest(pdf));
    expect(key).toBe(`report-quality/candidates/audit-1/run-1/fr-${hex(digest)}.pdf`);
    expect(await store.get(key)).toEqual(pdf);
  });

  it('aborts when the stored bytes cannot be read back verbatim', async () => {
    const store = new CorruptingArtifactStore();

    await expect(
      putPrivateCandidatePdf(store, {
        auditId: 'audit-1',
        qualityRunId: 'run-1',
        language: 'en',
        pdf: Buffer.from('candidate-pdf-bytes-en'),
      }),
    ).rejects.toThrow('Artifact readback verification failed');
  });
});

describe('promoteContentAddressedPdf', () => {
  it('refuses to promote when the candidate bytes are missing from the store', async () => {
    const store = new InMemoryArtifactStore();
    const privateKey = 'report-quality/candidates/audit-1/run-1/fr-absent.pdf';

    await expect(
      promoteContentAddressedPdf(store, privateKey, sha256('never-stored')),
    ).rejects.toThrow('Promotion aborted: candidate bytes are missing or changed');
  });

  it('refuses to promote when the candidate bytes changed since they were approved', async () => {
    const store = new InMemoryArtifactStore();
    const privateKey = 'report-quality/candidates/audit-1/run-1/fr-original.pdf';
    await store.put(privateKey, Buffer.from('mutated-after-approval'));

    await expect(
      promoteContentAddressedPdf(store, privateKey, bytesDigest(Buffer.from('original-approved'))),
    ).rejects.toThrow('Promotion aborted: candidate bytes are missing or changed');
  });

  it('promotes verified candidate bytes to the delivered content address and is idempotent', async () => {
    const store = new InMemoryArtifactStore();
    const candidate = Buffer.from('final-rendered-report');
    const privateKey = 'report-quality/candidates/audit-1/run-1/fr-final.pdf';
    await store.put(privateKey, candidate);

    const deliveredKey = await promoteContentAddressedPdf(
      store,
      privateKey,
      bytesDigest(candidate),
    );
    expect(deliveredKey).toBe(`report-quality/delivered/sha256/${hex(bytesDigest(candidate))}.pdf`);
    expect(await store.get(deliveredKey)).toEqual(candidate);

    // Promoting the same content again returns the same delivered key and
    // stores no duplicate object.
    await expect(
      promoteContentAddressedPdf(store, privateKey, bytesDigest(candidate)),
    ).resolves.toBe(deliveredKey);
    expect(await store.list('report-quality/delivered/')).toHaveLength(1);
  });

  it('refuses an immutable delivered-object collision', async () => {
    const store = new InMemoryArtifactStore();
    const candidate = Buffer.from('legitimate-report-bytes');
    const privateKey = 'report-quality/candidates/audit-1/run-1/en-final.pdf';
    await store.put(privateKey, candidate);
    const deliveredKey = `report-quality/delivered/sha256/${hex(bytesDigest(candidate))}.pdf`;
    await store.put(deliveredKey, Buffer.from('different-bytes-already-at-that-address'));

    await expect(
      promoteContentAddressedPdf(store, privateKey, bytesDigest(candidate)),
    ).rejects.toThrow('Immutable delivered object collision');
  });
});

describe('readVerifiedImmutablePdf', () => {
  it('returns the bytes when the stored digest matches the expectation', async () => {
    const store = new InMemoryArtifactStore();
    const pdf = Buffer.from('delivered-report');
    const key = `report-quality/delivered/sha256/${hex(bytesDigest(pdf))}.pdf`;
    await store.put(key, pdf);

    await expect(readVerifiedImmutablePdf(store, key, bytesDigest(pdf))).resolves.toEqual(pdf);
  });

  it('refuses missing report bytes', async () => {
    const store = new InMemoryArtifactStore();
    await expect(
      readVerifiedImmutablePdf(store, 'report-quality/delivered/sha256/absent.pdf', sha256('x')),
    ).rejects.toThrow('Report bytes unavailable');
  });

  it('refuses a digest mismatch instead of serving changed bytes', async () => {
    const store = new InMemoryArtifactStore();
    const pdf = Buffer.from('delivered-report');
    const key = `report-quality/delivered/sha256/${hex(bytesDigest(pdf))}.pdf`;
    await store.put(key, pdf);

    await expect(
      readVerifiedImmutablePdf(store, key, bytesDigest(Buffer.from('something-else'))),
    ).rejects.toThrow('Report digest mismatch');
  });
});
