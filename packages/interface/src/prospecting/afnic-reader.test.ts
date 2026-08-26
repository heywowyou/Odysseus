import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { streamAfnicCandidates } from './afnic-reader.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(
  moduleDir,
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'prospecting',
  'afnic-sample.csv',
);

describe('streamAfnicCandidates', () => {
  it('decodes ISO-8859-1 correctly, including an accented field', async () => {
    const result = await streamAfnicCandidates(fixturePath, 0, 100);
    const org1 = result.candidates.find((c) => c.domain === 'example-org1.fr');
    expect(org1?.titulaireDepartment).toBe('Rhône');
  });

  it('drops a domain with a populated withdrawal date', async () => {
    const result = await streamAfnicCandidates(fixturePath, 0, 100);
    expect(result.candidates.some((c) => c.domain === 'example-org2.fr')).toBe(false);
  });

  it('drops a personne physique holder', async () => {
    const result = await streamAfnicCandidates(fixturePath, 0, 100);
    expect(result.candidates.some((c) => c.domain === 'example-pp.fr')).toBe(false);
  });

  it('keeps ORG holders with no withdrawal date', async () => {
    const result = await streamAfnicCandidates(fixturePath, 0, 100);
    const domains = result.candidates.map((c) => c.domain);
    expect(domains).toEqual(expect.arrayContaining(['example-org1.fr', 'example-org3.fr']));
    expect(result.exhausted).toBe(true);
  });

  it('parses the IDN flag', async () => {
    const result = await streamAfnicCandidates(fixturePath, 0, 100);
    const org1 = result.candidates.find((c) => c.domain === 'example-org1.fr');
    const org3 = result.candidates.find((c) => c.domain === 'example-org3.fr');
    expect(org1?.idn).toBe(false);
    expect(org3?.idn).toBe(true);
  });

  it('resuming from a recorded nextByteOffset picks up exactly where a prior partial read stopped', async () => {
    // First read: only the first ORG candidate.
    const first = await streamAfnicCandidates(fixturePath, 0, 1);
    expect(first.candidates.map((c) => c.domain)).toEqual(['example-org1.fr']);
    expect(first.exhausted).toBe(false);

    // Resume from where the first read left off, reusing its discovered header.
    const second = await streamAfnicCandidates(
      fixturePath,
      first.nextByteOffset,
      100,
      first.headerColumns,
    );
    const domains = second.candidates.map((c) => c.domain);
    expect(domains).not.toContain('example-org1.fr');
    expect(domains).toContain('example-org3.fr');
    expect(second.exhausted).toBe(true);
  });

  it('throws if resuming from a non-zero offset without headerColumns', async () => {
    await expect(streamAfnicCandidates(fixturePath, 100, 10)).rejects.toThrow(/headerColumns/);
  });
});
