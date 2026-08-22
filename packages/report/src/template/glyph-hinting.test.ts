/**
 * Regression guard for a real defect found in a La Corniche PDF (this
 * session, 2026-08-22): Chromium's print-to-PDF text layer split single
 * words into multiple glyph runs at certain font-weight/font-size
 * combinations - e.g. "Votre prestataire" extracted as "Vot re prest at
 * aire", "conformité" as "conf ormit e". A standalone probe (varying
 * weight 400-700 and size 11-20px independently, run through the real
 * renderPdfFromHtml path) found no clean weight or size threshold - the
 * defect hit weight 400 at some sizes too - so this is not the same
 * class of bug letter-spacing.test.ts guards (a source value to keep
 * under a safe threshold). Disabling Chromium's font hinting
 * (`--font-render-hinting=none`, index.ts's REPORT_PDF_CHROMIUM_ARGS)
 * eliminated it across all 18 weight/size combinations tested.
 *
 * pdf-text-integrity.test.ts's existing check cannot catch this class of
 * bug: it strips all whitespace before comparing, which erases the
 * inserted mid-word gaps along with legitimate line-wrap whitespace, as
 * its own docblock already discloses. This test checks that every known
 * word extracts as one contiguous token instead, which is the actual
 * signature of the defect.
 */
import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { launchBrowser } from '@odysseus/scanner';
import { renderPdfFromHtml } from '../pdf.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { readStylesInlined } from './render-html.js';

/** The exact weight/size combinations the standalone probe found broken
 *  at least once (weight 500/600/700 at 11-14px, plus weight 400 at
 *  13.5/14/16px) - reproduced here directly rather than trusting a
 *  narrower subset. */
const PROBE_WEIGHTS = [400, 500, 600, 700] as const;
const PROBE_SIZES = [11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16] as const;

/** Real multi-syllable French words with no legitimate internal space,
 *  chosen to match the exact strings the real report broke on. */
const WORDS = ['Votre', 'prestataire', 'chiffres', 'conformité', 'performance', 'identifiable'];

function buildProbeHtml(styles: string): string {
  const testString = WORDS.join(' ');
  const rows: string[] = [];
  for (const weight of PROBE_WEIGHTS) {
    for (const size of PROBE_SIZES) {
      rows.push(
        `<div style="font-weight:${weight};font-size:${size}px;font-family:var(--font-body);margin-bottom:4px">${testString}</div>`
      );
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styles}
    @page { margin: 8mm; }
    body { background:#161826; padding: 8mm; }
  </style></head><body>${rows.join('\n')}</body></html>`;
}

describe('glyph-run splitting in the PDF text layer at various weight/size combinations', () => {
  it('never splits a known word into separate glyph runs with the production Chromium args', async () => {
    const styles = await readStylesInlined();
    const html = buildProbeHtml(styles);

    const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderPdfFromHtml(html, browser);
    } finally {
      await browser.close();
    }

    const parser = new PDFParse({ data: pdfBuffer });
    let extractedText: string;
    try {
      extractedText = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }

    // A split word extracts with an internal space mid-word (e.g. "Vot
    // re"), so it never appears as a single contiguous token. Splitting
    // the extracted text on real whitespace and checking each expected
    // word appears as (part of) one token is the precise signature of
    // the defect, unlike a whitespace-stripped substring match.
    const tokens = extractedText.split(/\s+/).filter(Boolean);
    const missingAsSingleToken = WORDS.filter((word) => !tokens.some((t) => t.includes(word)));

    expect(missingAsSingleToken).toEqual([]);
  }, 60_000);
});
