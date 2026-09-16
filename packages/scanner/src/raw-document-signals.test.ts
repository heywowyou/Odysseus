import { describe, expect, it } from 'vitest';
import { analyzeRawDocument } from './raw-document-signals.js';

describe('analyzeRawDocument (issue #301)', () => {
  it('records the markup length alongside the text hash', () => {
    const html = '<html><head><title>Hi</title></head><body><p>Bonjour</p></body></html>';
    const signals = analyzeRawDocument(html);
    expect(signals.markupLength).toBe(html.length);
    expect(signals.textSignature).toMatch(/^[0-9a-f]{16}$/);
    expect(signals.interstitialMarkers).toEqual([]);
  });

  it('gives two documents with the same visible text the same signature', () => {
    const a = analyzeRawDocument('<body><p>Bonjour</p></body>');
    const b = analyzeRawDocument('<body><div><p>Bonjour</p></div></body>');
    expect(a.textSignature).toBe(b.textSignature);
  });

  it('names a bot challenge', () => {
    const signals = analyzeRawDocument(
      '<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget"></div></body></html>',
    );
    expect(signals.interstitialMarkers).toEqual(['bot-challenge', 'bot-challenge-title']);
  });

  it('names a document whose only job is to redirect', () => {
    expect(
      analyzeRawDocument(
        '<html><head><meta http-equiv="refresh" content="0;url=/fr/"></head></html>',
      ).interstitialMarkers,
    ).toEqual(['meta-refresh']);
  });

  it('does not treat a noscript notice as an interstitial', () => {
    // A page that says "enable JavaScript" instead of serving content is
    // precisely what the render diff is meant to report, not a wall this
    // scan happened to hit.
    expect(
      analyzeRawDocument(
        '<html><body><noscript>Veuillez activer JavaScript pour consulter ce site.</noscript><div id="app"></div></body></html>',
      ).interstitialMarkers,
    ).toEqual([]);
  });
});
