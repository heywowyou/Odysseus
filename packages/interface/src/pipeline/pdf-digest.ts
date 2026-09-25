import { createHash } from 'node:crypto';
import { createFileVersionCache } from './file-version-cache.js';

/** The one definition of the stored-report digest convention: sha256 over
 *  the PDF bytes, `sha256:` prefixed. report-stage writes it into the
 *  reports row; routes/audits.ts and report-integrity.ts verify the served
 *  or swept file against it, so the row's pdfDigest authenticates the paid
 *  deliverable. */
export function pdfDigestOf(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

/**
 * The digest of the PDF at `localPath`, hashed once per file version
 * (issue #511). Undefined when the file is not on disk. For availability
 * display only: a path that serves or approves the PDF verifies the bytes
 * it actually reads.
 */
export const localPdfDigest = createFileVersionCache(pdfDigestOf);
