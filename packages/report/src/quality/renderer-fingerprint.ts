import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sha256Digest } from '@odysseus/core';
import { readStylesInlined } from '../template/render-html.js';
function digest(value: string): Sha256Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
export async function reportRendererAssetFingerprints(): Promise<{
  rendererAssets: Sha256Digest;
  fonts: Sha256Digest;
}> {
  const styles = await readStylesInlined();
  const fonts = [...styles.matchAll(/data:font\/(?:woff2|ttf);base64,([A-Za-z0-9+/=]+)/g)]
    .map((m) => m[1] ?? '')
    .join('\n');
  if (!fonts)
    throw new Error(
      'Report quality snapshot aborted: embedded report fonts could not be fingerprinted',
    );
  return { rendererAssets: digest(styles), fonts: digest(fonts) };
}

const EXCLUDED = /\.(?:test|e2e\.test)\.[cm]?[jt]s$|\.d\.ts$|\.map$|\.tsbuildinfo$/;

async function treeDigest(root: string): Promise<Sha256Digest> {
  const hash = createHash('sha256');
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await walk(full)));
      else if (entry.isFile() && !EXCLUDED.test(entry.name)) files.push(full);
    }
    return files;
  };
  const files = (await walk(root)).map((file) => path.relative(root, file)).sort();
  if (files.length === 0) throw new Error(`Renderer code fingerprint: ${root} has no files`);
  for (const file of files) {
    hash.update(file).update('\0');
    hash.update(await fs.readFile(path.join(root, file))).update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

let cachedCodeFingerprint: Promise<Sha256Digest> | undefined;

/**
 * Plan 058 §15: the exact code that renders and checks a candidate. The
 * build id is the committed HEAD, which does not move with an uncommitted
 * template or QA edit, so a content-addressed render/QA node also keys on
 * the report and core module trees actually loaded (source under vitest/tsx,
 * dist under the CLI) plus the pinned browser and Paged.js versions.
 */
export function reportRendererCodeFingerprint(): Promise<Sha256Digest> {
  cachedCodeFingerprint ??= (async () => {
    const reportRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const coreRoot = path.resolve(reportRoot, '..', '..', 'core', path.basename(reportRoot));
    const require = createRequire(import.meta.url);
    // pagedjs exports no package.json subpath; its root sits two levels
    // above the resolved entry (lib/index.cjs), as in pdf.ts.
    const pagedRoot = path.dirname(path.dirname(require.resolve('pagedjs')));
    const playwrightRoot = path.dirname(require.resolve('playwright/package.json'));
    const version = async (root: string) =>
      (
        JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version;
    return digest(
      JSON.stringify({
        report: await treeDigest(reportRoot),
        core: await treeDigest(coreRoot),
        playwright: await version(playwrightRoot),
        pagedjs: await version(pagedRoot),
      }),
    );
  })();
  return cachedCodeFingerprint;
}
