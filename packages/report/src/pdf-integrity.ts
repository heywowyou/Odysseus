import type { ReportLanguage } from '@odysseus/core';

/**
 * Byte-level checks on the finished report PDF, run in-process after
 * Chromium writes it and before anything is stored or delivered. The layout
 * gates in pdf.ts judge the Paged.js DOM; these judge the file a client
 * actually opens: every font is one the report embeds (never a host
 * fallback), the document declares its language and title, it is tagged,
 * it carries no active content, forms or encryption, every page is A4 and
 * unrotated, and every link is a plain web or mail link.
 *
 * Chromium's PDF writer emits uncompressed object dictionaries, so the
 * checks read the raw bytes without a PDF library or the external poppler
 * and qpdf tools the production image does not ship. A file that uses
 * object streams would hide dictionaries from this reader, so it fails
 * closed rather than passing unseen.
 */

/** Font families the report embeds itself (nocturne.css and the mono
 *  face). A six-letter subset prefix is allowed; anything else is a host
 *  fallback font leaking into a client document. */
export const REPORT_EMBEDDED_FONT_FAMILIES =
  /^(?:[A-Z]{6}\+)?(?:AvenirNextCyr-(?:Regular|Italic|Medium|Demi|Bold)|DejaVuSansMono)$/;

/** A4 in points, and how far Chromium's rounding may drift from it. */
const A4_PT = { width: 595.28, height: 841.89 };
const A4_TOLERANCE_PT = 1;

const ACTIVE_CONTENT_KEYS = [
  'JavaScript',
  'JS',
  'Launch',
  'AcroForm',
  'Encrypt',
  'EmbeddedFile',
  'EmbeddedFiles',
  'RichMedia',
  'SubmitForm',
  'ImportData',
  'GoToR',
  'GoToE',
  'XFA',
] as const;

const ALLOWED_URI = /^(?:https?:\/\/|mailto:)/i;

/** Reads one PDF string (literal `( … )` with escapes and nesting, or hex
 *  `< … >`) starting at `start`, and returns its decoded text. */
function readPdfString(latin1: string, start: number): string | undefined {
  if (latin1[start] === '<') {
    const end = latin1.indexOf('>', start);
    if (end < 0) return undefined;
    const hex = latin1.slice(start + 1, end).replace(/\s+/g, '');
    const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex');
    return decodePdfTextBytes(bytes);
  }
  if (latin1[start] !== '(') return undefined;
  let depth = 0;
  const out: number[] = [];
  for (let i = start; i < latin1.length; i++) {
    const ch = latin1[i]!;
    if (ch === '\\') {
      const next = latin1[i + 1];
      i++;
      if (next === undefined) return undefined;
      const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      if (next in escapes) out.push(escapes[next]!);
      else if (/[0-7]/.test(next)) {
        const octal = latin1.slice(i, i + 3).match(/^[0-7]{1,3}/)![0];
        out.push(parseInt(octal, 8) & 0xff);
        i += octal.length - 1;
      } else if (next === '\r' || next === '\n') {
        if (next === '\r' && latin1[i + 1] === '\n') i++;
      } else out.push(next.charCodeAt(0));
      continue;
    }
    if (ch === '(') {
      depth++;
      if (depth === 1) continue;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return decodePdfTextBytes(Buffer.from(out));
    }
    out.push(ch.charCodeAt(0));
  }
  return undefined;
}

function decodePdfTextBytes(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = Buffer.from(bytes.subarray(2));
    body.swap16();
    return body.toString('utf16le');
  }
  return bytes.toString('latin1');
}

function stringValues(latin1: string, key: string): (string | undefined)[] {
  const values: (string | undefined)[] = [];
  const pattern = new RegExp(`/${key}\\s*(?=[(<])`, 'g');
  for (let m = pattern.exec(latin1); m; m = pattern.exec(latin1)) {
    // `<<` opens a dictionary, not a hex string.
    if (latin1.startsWith('<<', m.index + m[0].length)) continue;
    values.push(readPdfString(latin1, m.index + m[0].length));
  }
  return values;
}

/** The document information dictionary's title, reached through the
 *  trailer's `/Info` reference. */
function documentTitle(latin1: string): string | undefined {
  const infoRefs = [...latin1.matchAll(/trailer\s*<<[\s\S]*?\/Info\s+(\d+)\s+(\d+)\s+R/g)];
  const ref = infoRefs.at(-1);
  if (!ref) return undefined;
  const objStart = latin1.search(new RegExp(`(?:^|[\\r\\n\\s])${ref[1]}\\s+${ref[2]}\\s+obj\\b`));
  if (objStart < 0) return undefined;
  const objEnd = latin1.indexOf('endobj', objStart);
  const body = latin1.slice(objStart, objEnd < 0 ? undefined : objEnd);
  return stringValues(body, 'Title')[0];
}

export interface ReportPdfIntegrityExpectation {
  language: ReportLanguage;
  /** Page count Paged.js laid out; the file must carry exactly that many. */
  pageCount: number;
}

/** Every defect found, in a stable order; empty means the file passes. */
export function findReportPdfIntegrityDefects(
  pdf: Buffer,
  expected: ReportPdfIntegrityExpectation,
): string[] {
  const defects: string[] = [];
  const raw = pdf.toString('latin1');
  if (!raw.startsWith('%PDF-')) return ['the file is not a PDF'];
  // Stream bodies are compressed binary (page content, fonts, images) and
  // can contain any byte sequence, `/JS` included; only the object syntax
  // between them is inspected.
  const latin1 = raw.replace(/\bstream\r?\n[\s\S]*?\bendstream\b/g, 'stream endstream');
  if (/\/Type\s*\/ObjStm\b/.test(latin1))
    return ['the PDF packs objects into compressed streams, which this gate cannot inspect'];

  for (const key of ACTIVE_CONTENT_KEYS) {
    if (new RegExp(`/${key}(?![A-Za-z0-9])`).test(latin1))
      defects.push(`the PDF carries active or interactive content (/${key})`);
  }

  const fontNames = [...latin1.matchAll(/\/BaseFont\s*\/([^\s/<>[\]()]+)/g)].map((m) => m[1]!);
  const foreign = [
    ...new Set(fontNames.filter((name) => !REPORT_EMBEDDED_FONT_FAMILIES.test(name))),
  ];
  if (foreign.length > 0)
    defects.push(`the PDF uses fonts the report does not embed: ${foreign.sort().join(', ')}`);
  // A Type 3 font carries its glyphs as drawing procedures inside the file
  // (Chromium writes one for synthesized styles such as a bold weight the
  // embedded face lacks), so its descriptor legitimately has no font file.
  const objects = new Map<string, string>();
  for (const m of latin1.matchAll(/(?:^|\s)(\d+)\s+0\s+obj\b([\s\S]*?)\bendobj\b/g))
    objects.set(m[1]!, m[2]!);
  const type3Descriptors = new Set<string>();
  for (const body of objects.values()) {
    const ref = /\/Subtype\s*\/Type3\b/.test(body)
      ? body.match(/\/FontDescriptor\s+(\d+)\s+0\s+R/)?.[1]
      : undefined;
    if (ref) type3Descriptors.add(ref);
  }
  const unembedded = [...objects].filter(
    ([id, body]) =>
      /\/Type\s*\/FontDescriptor\b/.test(body) &&
      !/\/FontFile[23]?\s+\d+\s+\d+\s+R/.test(body) &&
      !type3Descriptors.has(id),
  ).length;
  if (fontNames.length === 0) defects.push('the PDF names no fonts');
  else if (unembedded > 0) defects.push(`${unembedded} font(s) in the PDF are not embedded`);

  const langs = stringValues(latin1, 'Lang');
  if (!langs.some((lang) => lang?.toLowerCase().split('-')[0] === expected.language))
    defects.push(`the PDF does not declare its language as "${expected.language}"`);

  if (!documentTitle(latin1)?.trim()) defects.push('the PDF has no document title');

  if (!/\/StructTreeRoot\b/.test(latin1) || !/\/MarkInfo\s*<<[^>]*\/Marked\s+true/.test(latin1))
    defects.push('the PDF is not tagged');

  const pages = [...latin1.matchAll(/\/Type\s*\/Page(?![A-Za-z])/g)].length;
  if (pages !== expected.pageCount)
    defects.push(`the PDF has ${pages} page(s) where the layout produced ${expected.pageCount}`);

  const offSize = new Set<string>();
  for (const m of latin1.matchAll(
    /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g,
  )) {
    const width = Number(m[3]) - Number(m[1]);
    const height = Number(m[4]) - Number(m[2]);
    if (
      Math.abs(width - A4_PT.width) > A4_TOLERANCE_PT ||
      Math.abs(height - A4_PT.height) > A4_TOLERANCE_PT
    )
      offSize.add(`${width.toFixed(1)}×${height.toFixed(1)}pt`);
  }
  if (offSize.size > 0) defects.push(`page(s) are not A4: ${[...offSize].sort().join(', ')}`);
  if ([...latin1.matchAll(/\/Rotate\s+(-?\d+)/g)].some((m) => Number(m[1]) % 360 !== 0))
    defects.push('a page is rotated');

  const badLinks = stringValues(latin1, 'URI').filter(
    (uri) => uri === undefined || !ALLOWED_URI.test(uri),
  );
  if (badLinks.length > 0)
    defects.push(
      `the PDF links outside the web and mail: ${badLinks.map((uri) => uri ?? '<unreadable>').join(', ')}`,
    );

  return defects;
}

export function describeReportPdfIntegrityDefects(defects: readonly string[]): string {
  return `Report generation aborted: the finished PDF failed its file checks (${defects.join('; ')}). Never shipped to a client.`;
}
