import { createHash } from 'node:crypto';
import type { Sha256Digest } from '@odysseus/core';
import { readStylesInlined } from '../template/render-html.js';
function digest(value: string): Sha256Digest { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
export async function reportRendererAssetFingerprints(): Promise<{ rendererAssets: Sha256Digest; fonts: Sha256Digest }> {
  const styles = await readStylesInlined();
  const fonts = [...styles.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)].map((m) => m[1] ?? '').join('\n');
  if (!fonts) throw new Error('Report quality snapshot aborted: embedded report fonts could not be fingerprinted');
  return { rendererAssets: digest(styles), fonts: digest(fonts) };
}
