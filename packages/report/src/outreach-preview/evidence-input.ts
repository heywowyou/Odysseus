/**
 * Turns a stored prescan evidence asset into a preview image.
 *
 * The plan's file list had no home for this, and the gap is real: the preview
 * input carries base64, the evidence record carries a `ref` to a file on disk,
 * and somebody has to cross that boundary. Left out, plan 009's publisher would
 * reimplement the file read, the byte caps and the PNG check - which is the
 * duplication step 5's own deletion test is meant to prevent - so it is exported
 * here as a third public symbol rather than left to be rewritten downstream.
 *
 * It deliberately re-checks what the schema will check again a moment later.
 * The two checks answer different questions: this one says "the file on disk is
 * still the file the evidence recorded", and the schema's says "this input is
 * publishable". A file can be replaced, truncated or corrupted between a
 * prescan and a send, and the failure to catch is a preview showing the wrong
 * hotel's screenshot.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  HOTEL_EVIDENCE_MAX_ASSET_BYTES,
  type HotelEvidenceCapturedAsset,
  type OutreachPreviewImage,
} from '@odysseus/core';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Which of the two logical assets this is. The evidence record names them by
 *  the field they sit on, and the preview names them by kind, so the mapping is
 *  made explicit at the one place the two vocabularies meet. */
export type OutreachEvidenceSlot = 'renderComparison' | 'specificFailure';

const SLOT_KINDS: Record<OutreachEvidenceSlot, OutreachPreviewImage['kind']> = {
  renderComparison: 'render-comparison',
  specificFailure: 'specific-failure',
};

export async function embedOutreachEvidenceAsset(options: {
  /** The prescan directory the asset's `ref` is relative to. Relative, so a
   *  stored prescan survives the artifacts root moving, the same reason the
   *  audit manifest stores relative screenshot paths. */
  prescanDir: string;
  asset: HotelEvidenceCapturedAsset;
  slot: OutreachEvidenceSlot;
}): Promise<OutreachPreviewImage> {
  const file = path.join(options.prescanDir, options.asset.ref);
  const bytes = await readFile(file);

  if (bytes.byteLength !== options.asset.byteSize) {
    throw new Error(
      `outreach evidence ${options.asset.ref} is ${bytes.byteLength} bytes on disk but the ` +
        `prescan recorded ${options.asset.byteSize}: the file changed after it was captured`,
    );
  }
  if (bytes.byteLength > HOTEL_EVIDENCE_MAX_ASSET_BYTES) {
    throw new Error(`outreach evidence ${options.asset.ref} exceeds the per-asset byte cap`);
  }
  if (!bytes.subarray(0, PNG_MAGIC.byteLength).equals(PNG_MAGIC)) {
    throw new Error(`outreach evidence ${options.asset.ref} is not a PNG`);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== options.asset.sha256) {
    throw new Error(
      `outreach evidence ${options.asset.ref} does not match its recorded hash: this is a ` +
        'different image than the one the prescan measured',
    );
  }

  return {
    kind: SLOT_KINDS[options.slot],
    base64: bytes.toString('base64'),
    byteSize: bytes.byteLength,
    width: options.asset.width,
    height: options.asset.height,
    altText: options.asset.altText,
  };
}
