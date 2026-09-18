/**
 * Plan 058 §11.4 cross-renderer portability. The candidate is rasterized by
 * Poppler (the canonical engine the models review) and by MuPDF; each page
 * pair is compared here on grayscale rasters at the same DPI.
 *
 * Anti-aliasing and hinting differ between engines on every glyph edge, so a
 * pixel diff is noise. The comparison is on ink density per block: a block
 * is a square of `blockPx` pixels, its ink the mean darkness. A glyph drawn
 * slightly differently moves a block's ink by a few percent; a missing,
 * substituted or displaced run of text, image or rule moves it by tens of
 * percent. Thresholds are measured on known-good reports (see
 * RENDER_DIVERGENCE_POLICY) and never tuned per report.
 */

export interface GrayRaster {
  width: number;
  height: number;
  /** One byte per pixel, row-major, 0 = black, 255 = white. */
  data: Uint8Array;
}

export interface RenderDivergencePolicy {
  dpi: number;
  blockPx: number;
  /** A block whose ink density differs by more than this (0..1) is material. */
  materialBlockDelta: number;
  /** More material blocks than this on one page is a material divergence. */
  maxMaterialBlocks: number;
  /** Page raster sizes may differ by rounding only. */
  maxSizeDeltaPx: number;
}

export interface PageDivergence {
  pageNumber: number;
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  maxBlockDelta: number;
  materialBlocks: number;
  /** Up to 20 worst material blocks, as pixel rectangles on raster A. */
  worstBlocks: Array<{ x: number; y: number; size: number; delta: number }>;
  material: boolean;
  reason?: 'size' | 'ink';
}

/** Parses a binary PGM (P5, maxval 255) as both Poppler and MuPDF write it. */
export function parsePgm(bytes: Buffer): GrayRaster {
  let offset = 0;
  const tokens: string[] = [];
  while (tokens.length < 4) {
    while (offset < bytes.length && /\s/.test(String.fromCharCode(bytes[offset]!))) offset += 1;
    if (bytes[offset] === 0x23) {
      while (offset < bytes.length && bytes[offset] !== 0x0a) offset += 1;
      continue;
    }
    let token = '';
    while (offset < bytes.length && !/\s/.test(String.fromCharCode(bytes[offset]!))) {
      token += String.fromCharCode(bytes[offset]!);
      offset += 1;
    }
    if (!token) throw new Error('PGM header is truncated');
    tokens.push(token);
  }
  offset += 1;
  const [magic, w, h, max] = tokens;
  const width = Number(w),
    height = Number(h);
  if (magic !== 'P5' || max !== '255' || !Number.isInteger(width) || !Number.isInteger(height))
    throw new Error(`Unsupported PGM raster: ${tokens.join(' ')}`);
  const data = bytes.subarray(offset, offset + width * height);
  if (data.length !== width * height) throw new Error('PGM raster data is truncated');
  return { width, height, data: new Uint8Array(data) };
}

function blockInk(raster: GrayRaster, x0: number, y0: number, size: number): number {
  const x1 = Math.min(raster.width, x0 + size),
    y1 = Math.min(raster.height, y0 + size);
  let sum = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * raster.width;
    for (let x = x0; x < x1; x += 1) sum += 255 - raster.data[row + x]!;
  }
  return sum / ((x1 - x0) * (y1 - y0) * 255);
}

export function comparePageRasters(
  pageNumber: number,
  a: GrayRaster,
  b: GrayRaster,
  policy: RenderDivergencePolicy,
): PageDivergence {
  const base = {
    pageNumber,
    widthA: a.width,
    heightA: a.height,
    widthB: b.width,
    heightB: b.height,
  };
  if (
    Math.abs(a.width - b.width) > policy.maxSizeDeltaPx ||
    Math.abs(a.height - b.height) > policy.maxSizeDeltaPx
  )
    return {
      ...base,
      maxBlockDelta: 1,
      materialBlocks: 0,
      worstBlocks: [],
      material: true,
      reason: 'size',
    };
  const width = Math.min(a.width, b.width),
    height = Math.min(a.height, b.height);
  const size = policy.blockPx;
  let maxBlockDelta = 0;
  const material: Array<{ x: number; y: number; size: number; delta: number }> = [];
  for (let y = 0; y < height; y += size)
    for (let x = 0; x < width; x += size) {
      const s = Math.min(size, width - x, height - y);
      const delta = Math.abs(blockInk(a, x, y, s) - blockInk(b, x, y, s));
      if (delta > maxBlockDelta) maxBlockDelta = delta;
      if (delta > policy.materialBlockDelta) material.push({ x, y, size: s, delta });
    }
  material.sort((p, q) => q.delta - p.delta);
  const isMaterial = material.length > policy.maxMaterialBlocks;
  return {
    ...base,
    maxBlockDelta,
    materialBlocks: material.length,
    worstBlocks: material.slice(0, 20),
    material: isMaterial,
    ...(isMaterial ? { reason: 'ink' as const } : {}),
  };
}
