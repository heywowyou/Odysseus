import { describe, expect, it } from 'vitest';
import { catchAllTextSignatures, type CatchAllProbe } from './catch-all.js';

const HOME = '6f5577b8add3399e';
const EN_SHELL = '73a58f695ec9d7de';

// Shapes read live on yonahotel.com on 2026-09-30.
const enProbe: CatchAllProbe = {
  url: 'https://www.yonahotel.com/en/odysseus-missing-page-3f9a2c',
  landedUrl: 'https://www.yonahotel.com/en/odysseus-missing-page-3f9a2c',
  httpStatus: 200,
  textSignature: EN_SHELL,
};

describe('catchAllTextSignatures (plan 075 M7)', () => {
  it('keeps a 2xx answer served at the probed path', () => {
    expect([...catchAllTextSignatures([enProbe], HOME)]).toEqual([EN_SHELL]);
  });

  it('ignores a probe that redirected to a page the other rules judge', () => {
    const rootProbe: CatchAllProbe = {
      url: 'https://www.yonahotel.com/odysseus-missing-page-3f9a2c',
      landedUrl: 'https://www.yonahotel.com/fr/erreur-404',
      httpStatus: 200,
      textSignature: '4d5cd775f6323f25',
    };
    expect(catchAllTextSignatures([rootProbe], HOME).size).toBe(0);
  });

  it('ignores an error status and a failed fetch', () => {
    expect(
      catchAllTextSignatures(
        [
          { ...enProbe, httpStatus: 404 },
          { url: enProbe.url, fetchError: 'timeout' },
        ],
        HOME,
      ).size,
    ).toBe(0);
  });

  it("ignores a single-page application's shared shell, which the homepage serves too", () => {
    expect(catchAllTextSignatures([{ ...enProbe, textSignature: HOME }], HOME).size).toBe(0);
  });

  it('decides nothing without the homepage signature or any probe', () => {
    expect(catchAllTextSignatures([enProbe], undefined).size).toBe(0);
    expect(catchAllTextSignatures(undefined, HOME).size).toBe(0);
  });
});
