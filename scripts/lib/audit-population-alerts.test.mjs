import { describe, expect, it } from 'vitest';
import { buildPopulationAlerts } from './audit-population-alerts.mjs';

const home = { url: 'https://example.com/', status: 'visited', depth: 0 };

function page(path, extra = {}) {
  return { url: `https://example.com${path}`, status: 'visited', depth: 1, ...extra };
}

function scan(path, signature, rawContentType, renderedTitle = 'Page') {
  return {
    url: `https://example.com${path}`,
    renderDiff: {
      renderedTitle,
      rawDocument: { textSignature: signature },
      ...(rawContentType !== undefined ? { rawContentType } : {}),
    },
  };
}

function alertsFor(pages, scans = [], findings = []) {
  return buildPopulationAlerts({ manifest: { pages }, scans, findings });
}

describe('population alerts', () => {
  it('stays quiet on a plain site', () => {
    const pages = [home, page('/chambres'), page('/contact'), page('/mentions-legales')];
    const scans = pages.map((entry, index) => scan(new URL(entry.url).pathname, `s${index}`));
    expect(alertsFor(pages, scans)).toEqual([]);
  });

  it('reports a homepage that was not analysed', () => {
    expect(alertsFor([{ ...home, status: 'blocked' }, page('/a')])).toEqual([
      'population: the homepage is not analysed (blocked)',
    ]);
  });

  it('accepts a homepage that redirects to an analysed page', () => {
    const typed = {
      ...home,
      status: 'redirect-interstitial',
      redirectTargetUrl: 'https://example.com/fr',
    };
    expect(alertsFor([typed, page('/fr')])).toEqual([]);
    expect(alertsFor([typed, page('/fr', { status: 'blocked' })])).toEqual([
      'population: the page the homepage redirects to is not analysed (blocked)',
    ]);
  });

  // A site that serves its pages only with a trailing slash and sends the
  // bare spelling to its homepage.
  it('reports most of the site redirecting to the homepage', () => {
    const redirects = Array.from({ length: 6 }, (_, i) =>
      page(`/p${i}`, {
        status: 'redirect-interstitial',
        redirectTargetUrl: 'https://example.com/',
      }),
    );
    const [alert] = alertsFor([home, ...redirects, page('/other')]);
    expect(alert).toMatch(/^population: 6 of 8 inventoried pages redirect to the homepage/);
  });

  it('leaves a few redirects to the homepage alone', () => {
    const redirects = Array.from({ length: 5 }, (_, i) =>
      page(`/p${i}`, {
        status: 'redirect-interstitial',
        redirectTargetUrl: 'https://example.com/',
      }),
    );
    const others = Array.from({ length: 20 }, (_, i) => page(`/q${i}`));
    expect(alertsFor([home, ...redirects, ...others])).toEqual([]);
  });

  it('reports analysed pages that serve one raw document', () => {
    const pages = [home, page('/en/a'), page('/en/b'), page('/en/c')];
    const scans = [
      scan('/', 'home'),
      scan('/en/a', 'shell'),
      scan('/en/b', 'shell'),
      scan('/en/c', 'shell'),
    ];
    expect(alertsFor(pages, scans)).toEqual([
      'population: 3 analysed pages serve one raw document (/en/a, /en/b, /en/c); a catch-all answer or copies of one page',
    ]);
  });

  it('leaves archive pages alone when their titles differ', () => {
    const pages = [home, page('/tag/a'), page('/tag/b'), page('/tag/c')];
    const scans = [
      scan('/', 'home'),
      scan('/tag/a', 'list', undefined, 'Tag a'),
      scan('/tag/b', 'list', undefined, 'Tag b'),
      scan('/tag/c', 'list', undefined, 'Tag c'),
    ];
    expect(alertsFor(pages, scans)).toEqual([]);
  });

  it('reports analysed pages that differ by their query string', () => {
    const pages = [home, page('/room?d=1'), page('/room?d=2'), page('/room?d=3')];
    expect(alertsFor(pages)[0]).toMatch(/^population: 3 analysed pages carry a query string/);
  });

  it('reports an analysed feed, by content type or by path', () => {
    const pages = [home, page('/actualites'), page('/feed')];
    const scans = [
      scan('/actualites', 'a', 'application/rss+xml; charset=UTF-8'),
      scan('/feed', 'b'),
    ];
    expect(alertsFor(pages, scans)).toEqual([
      'population: 2 analysed page(s) look like a feed or a file (/actualites, /feed)',
    ]);
  });

  it('does not count an HTML content type as a file', () => {
    const pages = [home, page('/a')];
    expect(alertsFor(pages, [scan('/a', 'a', 'text/html; charset=utf-8')])).toEqual([]);
  });

  it('reports an audit that analysed almost none of its inventory', () => {
    const skipped = Array.from({ length: 9 }, (_, i) => page(`/p${i}`, { status: 'blocked' }));
    expect(alertsFor([home, ...skipped])).toEqual([
      'population: only 1 of 10 inventoried pages are analysed',
    ]);
  });

  it('reports a serious site absence claim, not a moderate one', () => {
    const findings = [
      { ruleId: 'lcen-mentions-legales-missing', severity: 'serious' },
      { ruleId: 'accessibility-statement-missing', severity: 'moderate' },
    ];
    expect(alertsFor([home], [], findings)).toEqual([
      'absence: lcen-mentions-legales-missing (serious) states the site has none; confirm on the live site',
    ]);
  });
});
