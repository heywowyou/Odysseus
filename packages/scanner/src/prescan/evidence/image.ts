import type { Browser } from 'playwright';

export interface PngImage {
  bytes: Buffer;
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function readPngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Evidence image is not a PNG');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width <= 0 || height <= 0) throw new Error('Evidence PNG has invalid dimensions');
  return { width, height };
}

async function renderCanvas(
  browser: Browser,
  input: {
    width: number;
    height: number;
    images: string[];
    draw: string;
  },
): Promise<PngImage> {
  const context = await browser.newContext({
    viewport: { width: input.width, height: input.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.setContent('<canvas></canvas>');
    await page.evaluate(
      async ({ width, height, imageSources, drawSource }) => {
        const canvas = document.querySelector('canvas')!;
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const context2d = canvas.getContext('2d')!;
        const images = await Promise.all(
          imageSources.map(
            (source) =>
              new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('Unable to decode evidence PNG'));
                image.src = source;
              }),
          ),
        );
        const draw = new Function('context2d', 'images', 'width', 'height', drawSource);
        draw(context2d, images, width, height);
      },
      {
        width: input.width,
        height: input.height,
        imageSources: input.images,
        drawSource: input.draw,
      },
    );
    const bytes = await page.locator('canvas').screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });
    return { bytes, ...readPngDimensions(bytes) };
  } finally {
    await context.close();
  }
}

function pngDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

export async function composeRenderComparison(
  browser: Browser,
  rawBytes: Buffer,
  renderedBytes: Buffer,
): Promise<PngImage> {
  const raw = readPngDimensions(rawBytes);
  const rendered = readPngDimensions(renderedBytes);
  const width = 1200;
  const labelHeight = 48;
  const panelWidth = width / 2;
  const availableHeight = 900 - labelHeight;
  const rawScale = Math.min(panelWidth / raw.width, availableHeight / raw.height, 1);
  const renderedScale = Math.min(panelWidth / rendered.width, availableHeight / rendered.height, 1);
  const height = Math.max(
    200,
    Math.min(
      900,
      labelHeight + Math.ceil(Math.max(raw.height * rawScale, rendered.height * renderedScale)),
    ),
  );
  return renderCanvas(browser, {
    width,
    height,
    images: [pngDataUrl(rawBytes), pngDataUrl(renderedBytes)],
    draw: `
      context2d.fillStyle = '#f7f4ee';
      context2d.fillRect(0, 0, width, height);
      context2d.fillStyle = '#172026';
      context2d.font = '600 18px sans-serif';
      context2d.textBaseline = 'middle';
      context2d.fillText('Sans JavaScript / Without JavaScript', 20, 24);
      context2d.fillText('Rendu / Rendered', width / 2 + 20, 24);
      context2d.strokeStyle = '#a8a095';
      context2d.beginPath();
      context2d.moveTo(width / 2, 0);
      context2d.lineTo(width / 2, height);
      context2d.stroke();
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        const panelWidth = width / 2;
        const availableHeight = height - 48;
        const scale = Math.min(panelWidth / image.naturalWidth, availableHeight / image.naturalHeight, 1);
        const drawWidth = Math.floor(image.naturalWidth * scale);
        const drawHeight = Math.floor(image.naturalHeight * scale);
        const x = index * panelWidth + Math.floor((panelWidth - drawWidth) / 2);
        context2d.drawImage(image, x, 48, drawWidth, drawHeight);
      }
    `,
  });
}

export async function constrainPng(
  browser: Browser,
  original: Buffer,
  options: {
    maxWidth: number;
    maxHeight: number;
    maxBytes: number;
    minWidth: number;
    minHeight: number;
  },
): Promise<PngImage | null> {
  const dimensions = readPngDimensions(original);
  let scale = Math.min(
    1,
    options.maxWidth / dimensions.width,
    options.maxHeight / dimensions.height,
  );
  let candidate: PngImage = { bytes: original, ...dimensions };
  while (true) {
    const width = Math.max(1, Math.floor(dimensions.width * scale));
    const height = Math.max(1, Math.floor(dimensions.height * scale));
    if (width < options.minWidth || height < options.minHeight) return null;
    if (scale < 1 || dimensions.width > options.maxWidth || dimensions.height > options.maxHeight) {
      candidate = await renderCanvas(browser, {
        width,
        height,
        images: [pngDataUrl(original)],
        draw: `
          context2d.drawImage(images[0], 0, 0, width, height);
        `,
      });
    }
    if (candidate.bytes.byteLength <= options.maxBytes) return candidate;
    scale *= 0.8;
  }
}
