import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';
import { getOrBuildSireneStockIndex } from './sirene-stock-index.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(moduleDir, '..', '..', '..', '..', 'fixtures', 'prospecting', 'sirene-stock-sample.csv');

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

async function tempCachePath(): Promise<string> {
  tmpDir = await mkdtemp(path.join(tmpdir(), 'odysseus-sirene-stock-'));
  return path.join(tmpDir, 'stock-index-cache.jsonl');
}

describe('getOrBuildSireneStockIndex', () => {
  it('indexes a qualifying row (enabled NAF, effectifs >= 10, active)', async () => {
    const cachePath = await tempCachePath();
    const index = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    const entry = index.lookup('732829320');
    expect(entry).not.toBeNull();
    expect(entry?.naf).toBe('47.91A');
    expect(entry?.effectifBand.code).toBe('12');
  });

  it('excludes a qualifying NAF but too-small effectifs', async () => {
    const cachePath = await tempCachePath();
    const index = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    expect(index.lookup('111111118')).toBeNull();
  });

  it('excludes a qualifying effectifs but non-allowlisted NAF', async () => {
    const cachePath = await tempCachePath();
    const index = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    expect(index.lookup('222222226')).toBeNull();
  });

  it('excludes a blank trancheEffectifsUniteLegale rather than treating it as unknown-and-worth-scanning', async () => {
    const cachePath = await tempCachePath();
    const index = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    expect(index.lookup('333333334')).toBeNull();
  });

  it('excludes a non-active etatAdministratifUniteLegale', async () => {
    const cachePath = await tempCachePath();
    const index = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    expect(index.lookup('444444442')).toBeNull();
  });

  it('reads from cache instead of rescanning when the source file is unchanged', async () => {
    const cachePath = await tempCachePath();
    const first = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    expect(first.lookup('732829320')).not.toBeNull();

    // Prove the second call reads the (unchanged-fingerprint) cache
    // rather than rescanning: corrupt the cache's own data line (but
    // keep its fingerprint header line valid) so a rescan-vs-cache-read
    // is observable in the result rather than only in a spy count.
    const cacheContent = await readFile(cachePath, 'utf-8');
    const [fingerprintLine] = cacheContent.split('\n');
    await writeFile(cachePath, `${fingerprintLine}\n${JSON.stringify({ siren: 'sentinel', naf: 'x', denomination: 'y', effectifBand: { code: '12', label: 'y' }, etatAdministratif: 'A' })}\n`);

    const second = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    expect(second.lookup('sentinel')).not.toBeNull();
    expect(second.lookup('732829320')).toBeNull();
  });

  it('exposes the stock file fingerprint as version', async () => {
    const cachePath = await tempCachePath();
    const index = await getOrBuildSireneStockIndex(fixturePath, cachePath);
    expect(index.version).toBeTruthy();
  });
});
