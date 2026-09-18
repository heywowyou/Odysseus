import { describe, expect, it } from 'vitest';
import {
  assessTemporalCoherence,
  assetFamily,
  extractStructuralAnchor,
  type StructuralAnchor,
} from './temporal-anchors.js';

const HOME = 'https://hotel-exemple.fr/';
const ROOMS = 'https://hotel-exemple.fr/chambres';

interface Doc {
  css?: string;
  js?: string;
  heading?: string;
  nav?: string[];
  canonical?: string;
  text?: string;
}

function html(doc: Doc = {}): string {
  const nav = (doc.nav ?? ['/', '/chambres']).map((href) => `<a href="${href}">x</a>`).join('');
  return `<html lang="fr"><head>
<link rel="canonical" href="${doc.canonical ?? HOME}">
<link rel="stylesheet" href="${doc.css ?? '/wp-content/themes/villa/style.css?ver=6.4.2'}">
<script src="${doc.js ?? '/static/js/main.3f2a1b9c.js'}"></script>
<script src="https://www.googletagmanager.com/gtm.js?id=GTM-X&amp;t=123"></script>
</head><body><nav>${nav}<a href="https://booking.example/">Réserver</a></nav>
${doc.heading ?? '<h1>Bienvenue</h1><h2>Chambres</h2>'}<p>${doc.text ?? 'Offre du jour'}</p>
</body></html>`;
}

let clock = Date.parse('2026-09-18T09:00:00.000Z');
function anchor(url: string, doc: Doc = {}): StructuralAnchor {
  clock += 60_000;
  return extractStructuralAnchor(html(doc), url, new Date(clock));
}

describe('extractStructuralAnchor', () => {
  it('keeps structure and same-origin assets, not copy or third parties', () => {
    const result = anchor(HOME);
    expect(result.canonical).toBe(HOME);
    expect(result.lang).toBe('fr');
    expect(result.headingOutline).toBe('1.2');
    expect(result.navigationTargets).toEqual(['/', '/chambres']);
    expect(result.assets).toEqual([
      { family: '/static/js/main.#.js', version: '/static/js/main.3f2a1b9c.js' },
      {
        family: '/wp-content/themes/villa/style.css',
        version: '/wp-content/themes/villa/style.css?ver=6.4.2',
      },
    ]);
  });

  it('digests identically when only the copy changes', () => {
    const a = extractStructuralAnchor(html({ text: 'Offre A' }), HOME, new Date(0));
    const b = extractStructuralAnchor(html({ text: 'Offre B' }), HOME, new Date(0));
    expect(b.digest).toBe(a.digest);
  });
});

describe('assetFamily', () => {
  it('folds content hashes and generated build ids', () => {
    expect(assetFamily('/static/js/main.3f2a1b9c.js')).toBe('/static/js/main.#.js');
    expect(assetFamily('/_next/static/Xk9pQ2rT7vW3yZ1aB4cD/_buildManifest.js')).toBe(
      '/_next/static/#/_buildManifest.js',
    );
    expect(assetFamily('/assets/site.css')).toBe('/assets/site.css');
  });
});

describe('assessTemporalCoherence', () => {
  it('is unknown without the start probes or the end probe', () => {
    expect(
      assessTemporalCoherence({ startUrl: HOME, anchors: undefined, pageAnchors: [] }).status,
    ).toBe('unknown');
    expect(
      assessTemporalCoherence({
        startUrl: HOME,
        anchors: { startProbes: [anchor(HOME), anchor(HOME)] },
        pageAnchors: [],
      }),
    ).toEqual({ status: 'unknown', reasonCode: 'end-anchor-missing' });
  });

  it('is coherent when nothing structural changed over the window', () => {
    const result = assessTemporalCoherence({
      startUrl: HOME,
      anchors: { startProbes: [anchor(HOME), anchor(HOME)], endProbe: anchor(HOME) },
      pageAnchors: [anchor(HOME), anchor(ROOMS)],
    });
    expect(result.status).toBe('coherent');
  });

  it('detects a template deploy on the start page between the probes', () => {
    const result = assessTemporalCoherence({
      startUrl: HOME,
      anchors: {
        startProbes: [anchor(HOME), anchor(HOME)],
        endProbe: anchor(HOME, { css: '/wp-content/themes/villa/style.css?ver=6.5.0' }),
      },
      pageAnchors: [],
    });
    expect(result.status).toBe('drift-detected');
    expect(result.status === 'drift-detected' && result.materialTargets).toEqual([HOME]);
  });

  it('detects pages scanned on both sides of a deploy', () => {
    const result = assessTemporalCoherence({
      startUrl: HOME,
      anchors: { startProbes: [anchor(HOME), anchor(HOME)], endProbe: anchor(HOME) },
      pageAnchors: [
        anchor(HOME),
        anchor(ROOMS, { js: '/static/js/main.9e8d7c6b.js', nav: ['/', '/chambres'] }),
      ],
    });
    expect(result.status).toBe('drift-detected');
    expect(result.status === 'drift-detected' && result.materialTargets).toEqual([ROOMS]);
  });

  it('ignores a value the site changes on every request', () => {
    const buster = (n: number) => ({ css: `/wp-content/themes/villa/style.css?ver=${n}` });
    const result = assessTemporalCoherence({
      startUrl: HOME,
      anchors: {
        startProbes: [anchor(HOME, buster(1)), anchor(HOME, buster(2))],
        endProbe: anchor(HOME, buster(3)),
      },
      pageAnchors: [anchor(HOME, buster(4)), anchor(ROOMS, buster(5))],
    });
    expect(result.status).toBe('coherent');
  });

  it('treats a changed heading outline on the start page as drift', () => {
    const result = assessTemporalCoherence({
      startUrl: HOME,
      anchors: {
        startProbes: [anchor(HOME), anchor(HOME)],
        endProbe: anchor(HOME, { heading: '<h1>Bienvenue</h1><h2>Chambres</h2><h2>Spa</h2>' }),
      },
      pageAnchors: [],
    });
    expect(result.status).toBe('drift-detected');
  });
});
