import { createHash } from 'node:crypto';
import { extractHostSignalMarkers, type RawDocumentSignals } from '@odysseus/core';
import { extractTextFromHtml } from './extract-text.js';

/**
 * Issue #301: what the no-JavaScript pass actually fetched.
 *
 * The render diff compares raw text against rendered text and reports the
 * gap as content a crawler cannot see. That reading only holds if the raw
 * fetch received the page. When it received a bot challenge, a redirect
 * shell or an error body instead, the same measurement says "your content
 * is invisible" about a document the site never served for that URL.
 *
 * An explicit marker table, not a general "does this look odd" heuristic:
 * each entry is a wall that replaces the document wholesale and is
 * recognisable from its own boilerplate. A pattern is added here only when
 * a wall has actually been seen replacing a scanned page, the same bar
 * third-party-attribution.ts's vendor table is held to.
 *
 * Deliberately absent: "please enable JavaScript". A <noscript> notice in
 * place of content is not a wall this scan hit - it is exactly the finding
 * the render diff exists to report, and suppressing it would throw away
 * the true positives along with the false ones.
 */

export function analyzeRawDocument(html: string): RawDocumentSignals {
  const text = extractTextFromHtml(html);
  return {
    markupLength: html.length,
    visibleTextLength: text.length,
    // Truncated to 16 hex characters for the same reason the normalization
    // fingerprint is: this is an equality check between documents in one
    // audit, not a cryptographic commitment.
    textSignature: createHash('sha256').update(text).digest('hex').slice(0, 16),
    interstitialMarkers: extractHostSignalMarkers(html),
  };
}
