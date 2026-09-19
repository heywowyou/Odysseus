import { describe, expect, it } from 'vitest';
import { findReportPdfIntegrityDefects } from './pdf-integrity.js';

interface FakePdf {
  fonts?: string[];
  embedded?: boolean;
  lang?: string;
  title?: string;
  tagged?: boolean;
  pages?: number;
  mediaBox?: string;
  rotate?: number;
  uris?: string[];
  extra?: string;
  streamBody?: string;
}

/** Compressed bytes that happen to spell `/JS`, as real Flate data can. */
const STREAM_NOISE = `x${String.fromCharCode(1, 255)}/JS 1`;

/** The shape Chromium writes: plain dictionaries, binary stream bodies. */
function fakePdf(options: FakePdf = {}): Buffer {
  const fonts = options.fonts ?? ['AAAAAA+AvenirNextCyr-Regular', 'BAAAAA+DejaVuSansMono'];
  const pages = options.pages ?? 2;
  const objects: string[] = [];
  objects.push(
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R ${options.lang === undefined ? '/Lang (fr)' : options.lang}` +
      `${options.tagged === false ? '' : ' /StructTreeRoot 9 0 R /MarkInfo << /Marked true >>'} >>\nendobj`,
  );
  objects.push(`2 0 obj\n<< /Type /Pages /Count ${pages} >>\nendobj`);
  for (let i = 0; i < pages; i++) {
    objects.push(
      `${10 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ${options.mediaBox ?? '[0 0 594.95996 841.91998]'}` +
        `${options.rotate !== undefined ? ` /Rotate ${options.rotate}` : ''} >>\nendobj`,
    );
  }
  fonts.forEach((name, i) => {
    objects.push(
      `${30 + i} 0 obj\n<< /Type /Font /Subtype /TrueType /BaseFont /${name} >>\nendobj`,
    );
    objects.push(
      `${50 + i} 0 obj\n<< /Type /FontDescriptor /FontName /${name}` +
        `${options.embedded === false ? '' : ` /FontFile2 ${70 + i} 0 R`} >>\nendobj`,
    );
  });
  (options.uris ?? ['https://example.fr/reserver']).forEach((uri, i) => {
    objects.push(`${90 + i} 0 obj\n<< /Type /Action /S /URI /URI ${uri} >>\nendobj`);
  });
  objects.push(
    `99 0 obj\n<< /Length 12 >>\nstream\n${options.streamBody ?? STREAM_NOISE}\nendstream\nendobj`,
  );
  objects.push(
    `8 0 obj\n<< /Producer (Skia/PDF) ${options.title ?? '/Title (Audit du site)'} >>\nendobj`,
  );
  if (options.extra) objects.push(options.extra);
  return Buffer.from(
    `%PDF-1.4\n${objects.join('\n')}\ntrailer\n<< /Size 100 /Root 1 0 R /Info 8 0 R >>\n%%EOF`,
    'latin1',
  );
}

const fr = (pdf: Buffer, pageCount = 2) =>
  findReportPdfIntegrityDefects(pdf, { language: 'fr', pageCount });

describe('findReportPdfIntegrityDefects', () => {
  it('passes a Chromium-shaped report, ignoring byte noise inside compressed streams', () => {
    expect(fr(fakePdf())).toEqual([]);
  });

  it('fails a PDF set in a host fallback font', () => {
    expect(
      fr(fakePdf({ fonts: ['AAAAAA+AvenirNextCyr-Regular', 'DAAAAA+WenQuanYiZenHeiMono'] })),
    ).toEqual(['the PDF uses fonts the report does not embed: DAAAAA+WenQuanYiZenHeiMono']);
  });

  it('fails a font that is named but not embedded', () => {
    expect(fr(fakePdf({ embedded: false }))).toEqual(['2 font(s) in the PDF are not embedded']);
  });

  it('fails a Type 3 font, the synthesized-style glyphs some viewers draw poorly', () => {
    const type3 =
      '300 0 obj\n<< /Type /Font /Subtype /Type3 /FontDescriptor 301 0 R >>\nendobj\n' +
      '301 0 obj\n<< /Type /FontDescriptor /FontName /DAAAAA+DejaVuSansMono >>\nendobj';
    expect(fr(fakePdf({ extra: type3 }))).toEqual([
      'the PDF carries 1 Type 3 font(s): a style the embedded faces lack was synthesized',
    ]);
  });

  it('requires the declared language to match the report', () => {
    expect(findReportPdfIntegrityDefects(fakePdf(), { language: 'en', pageCount: 2 })).toEqual([
      'the PDF does not declare its language as "en"',
    ]);
    expect(fr(fakePdf({ lang: '' }))).toEqual(['the PDF does not declare its language as "fr"']);
    expect(fr(fakePdf({ lang: '/Lang <FEFF00660072>' }))).toEqual([]);
  });

  it('requires a document title, reading UTF-16 titles', () => {
    expect(fr(fakePdf({ title: '' }))).toEqual(['the PDF has no document title']);
    expect(fr(fakePdf({ title: '/Title <FEFF0041007500640069007400A0>' }))).toEqual([]);
  });

  it('requires a tagged PDF', () => {
    expect(fr(fakePdf({ tagged: false }))).toEqual(['the PDF is not tagged']);
  });

  it('requires the page count the layout produced', () => {
    expect(fr(fakePdf({ pages: 3 }))).toEqual([
      'the PDF has 3 page(s) where the layout produced 2',
    ]);
  });

  it('requires unrotated A4 pages', () => {
    expect(fr(fakePdf({ mediaBox: '[0 0 612 792]' }))).toEqual([
      'page(s) are not A4: 612.0×792.0pt',
    ]);
    expect(fr(fakePdf({ rotate: 90 }))).toEqual(['a page is rotated']);
    expect(fr(fakePdf({ rotate: 0 }))).toEqual([]);
  });

  it('allows only web and mail links, escaped parentheses included', () => {
    expect(
      fr(fakePdf({ uris: ['(https://example.fr/a\\(1\\))', '(mailto:contact@example.fr)'] })),
    ).toEqual([]);
    expect(fr(fakePdf({ uris: ['(javascript:alert\\(1\\))', '(file:///etc/passwd)'] }))).toEqual([
      'the PDF links outside the web and mail: javascript:alert(1), file:///etc/passwd',
    ]);
  });

  it.each(['JavaScript', 'JS', 'Launch', 'AcroForm', 'Encrypt', 'EmbeddedFiles', 'SubmitForm'])(
    'fails active or interactive content (/%s) in the object syntax',
    (key) => {
      expect(fr(fakePdf({ extra: `200 0 obj\n<< /${key} 201 0 R >>\nendobj` }))).toEqual([
        `the PDF carries active or interactive content (/${key})`,
      ]);
    },
  );

  it('fails closed on object streams it cannot read, and on non-PDF bytes', () => {
    expect(fr(fakePdf({ extra: '200 0 obj\n<< /Type /ObjStm /N 3 >>\nendobj' }))).toEqual([
      'the PDF packs objects into compressed streams, which this gate cannot inspect',
    ]);
    expect(fr(Buffer.from('<html></html>'))).toEqual(['the file is not a PDF']);
  });
});
