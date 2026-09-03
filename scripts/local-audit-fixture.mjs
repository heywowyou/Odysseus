#!/usr/bin/env node
/**
 * Local full-audit fixture: serves a deterministic, WordPress-shaped hotel
 * site on 127.0.0.1 for end-to-end validation of the audit pipeline
 * without any third-party traffic. The URL shape mirrors the motivating
 * case in GitHub issue #20 (hotelpointfrance.com): 521 sitemap-declared
 * URLs across nine Yoast-style child sitemaps, plus link-discovered
 * author and category pagination that no sitemap declares, including an
 * author archive family deep enough to exercise the continuation-family
 * guard.
 *
 * Ground-truth defects are planted so a generated report can be asserted
 * against known facts instead of a human "looks right" reading:
 * - four pages with an <img> missing its alt attribute entirely;
 * - /reservation/ (the transactional booking page) with a nameless
 *   <button> and a low-contrast text block;
 * - /a-propos/ with a heading-order violation.
 *
 * Usage:
 *   node scripts/local-audit-fixture.mjs [--port 47813] [--expectations FILE]
 *
 * With --expectations the script writes a JSON file listing every
 * sitemap-declared URL and the seeded defect facts, then exits without
 * serving; the audit validation step compares the finished manifest
 * against that file.
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
const PORT = Number(argValue('--port') ?? 47813);
const EXPECTATIONS_PATH = argValue('--expectations');
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** Issue #20's declared-site shape: nine child sitemaps, 521 URLs. */
const POSTS = Array.from({ length: 375 }, (_, i) => `/carnet-${i + 1}/`);
const STATIC_PAGES = [
  '/',
  '/a-propos/',
  '/contact/',
  '/mentions-legales/',
  '/reservation/',
  ...Array.from({ length: 50 }, (_, i) => `/page-${i + 1}/`),
];
const ROOMS = Array.from({ length: 22 }, (_, i) => `/chambre-${i + 1}/`);
const AMENITIES = Array.from({ length: 54 }, (_, i) => `/prestation-${i + 1}/`);
const CATEGORIES = Array.from({ length: 5 }, (_, i) => `/categorie-${i + 1}/`);
const TAGS = Array.from({ length: 3 }, (_, i) => `/tag-${i + 1}/`);
const LOCATIONS = Array.from({ length: 2 }, (_, i) => `/lieu-${i + 1}/`);
const ROOM_TYPES = Array.from({ length: 4 }, (_, i) => `/type-chambre-${i + 1}/`);
const AUTHOR = '/author/auteur/';

const POSTS_PER_LISTING_PAGE = 20;
const AUTHOR_PAGES = 30;

/** Posts 7, 77, 177 and chambre-5 carry an img with no alt attribute. */
const MISSING_ALT_PATHS = new Set(['/carnet-7/', '/carnet-77/', '/carnet-177/', '/chambre-5/']);

function sitemapIndexXml() {
  const children = [
    'post',
    'page',
    'room',
    'amenity',
    'category',
    'tag',
    'location',
    'room-type',
    'author',
  ];
  return {
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${children
      .map((c) => `  <sitemap><loc>${ORIGIN}/${c}-sitemap.xml</loc></sitemap>`)
      .join('\n')}\n</sitemapindex>\n`,
    type: 'application/xml',
  };
}

function urlSetXml(urls) {
  return {
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${ORIGIN}${u}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
    type: 'application/xml',
  };
}

function page({ title, h1, body, lang = 'fr', jsonLdType }) {
  const ld =
    jsonLdType === undefined
      ? ''
      : `<script type="application/ld+json">{"@context":"https://schema.org","@type":"${jsonLdType}"}</script>`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${title}</title>
${ld}
</head>
<body>
<header><nav><a href="/">Accueil</a> <a href="/reservation/">R&eacute;servation</a> <a href="/contact/">Contact</a> <a href="/mentions-legales/">Mentions l&eacute;gales</a></nav></header>
<main>
<h1>${h1}</h1>
${body}
</main>
<footer><p>H&ocirc;tel du Bassin, Arcachon</p></footer>
</body>
</html>
`;
}

function paragraphs(seed, count) {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += `<p>Paragraphe ${(seed * 31 + i) % 97} : le Bassin d'Arcachon au fil des mar&eacute;es, entre le Cap Ferret, la Dune du Pilat et les ports ostr&eacute;icoles.</p>\n`;
  }
  return out;
}

function render(url) {
  if (url === '/') {
    const links = [
      ...CATEGORIES,
      ...TAGS,
      ...LOCATIONS,
      ...ROOM_TYPES,
      `/author/auteur/`,
      `/reservation/`,
      `/a-propos/`,
      ...ROOMS.slice(0, 5),
      ...AMENITIES.slice(0, 5),
      ...POSTS.slice(0, 10),
    ];
    return page({
      title: 'Hôtel du Bassin',
      h1: "H&ocirc;tel du Bassin face au Bassin d'Arcachon",
      body: `${paragraphs(1, 3)}\n<nav>\n${links.map((l) => `<a href="${l}">${l}</a>`).join('\n')}\n</nav>\n`,
      jsonLdType: 'Hotel',
    });
  }
  if (url === '/reservation/') {
    return page({
      title: 'Réservation',
      h1: 'R&eacute;server une chambre',
      body: `<form action="/reservation/" method="get">
<p><label for="arrivee">Date d'arriv&eacute;e</label> <input id="arrivee" name="arrivee" type="date"></p>
<p><label for="depart">Date de d&eacute;part</label> <input id="depart" name="depart" type="date"></p>
<p><label for="nom">Nom</label> <input id="nom" name="nom" type="text"></p>
<p><button type="submit">R&eacute;server</button> <button type="button"></button></p>
</form>
<p style="color: #cccccc; background-color: #ffffff;">Nos tarifs sont modulables selon la saison.</p>
${paragraphs(7, 2)}`,
    });
  }
  if (url === '/a-propos/') {
    return page({
      title: 'À propos',
      h1: "&Agrave; propos de l'h&ocirc;tel",
      body: `<h4>Une histoire familiale</h4>\n${paragraphs(3, 2)}`,
    });
  }
  if (url === '/contact/' || url === '/mentions-legales/' || /^\/page-\d+\/$/.test(url)) {
    return page({ title: url, h1: url, body: paragraphs(url.length, 2) });
  }
  if (MISSING_ALT_PATHS.has(url)) {
    return page({
      title: url,
      h1: url,
      body: `<img src="/pixel.png" width="1" height="1">\n${paragraphs(url.length, 2)}`,
      jsonLdType: 'Article',
    });
  }
  if (/^\/carnet-\d+\/$/.test(url)) {
    const index = Number(url.match(/^\/carnet-(\d+)\//)[1]);
    const prev = index > 1 ? `/carnet-${index - 1}/` : null;
    const next = index < POSTS.length ? `/carnet-${index + 1}/` : null;
    const nav = [
      prev ? `<a href="${prev}">Pr&eacute;c&eacute;dent</a>` : '',
      next ? `<a href="${next}">Suivant</a>` : '',
      `<a href="/categorie-${(index % 5) + 1}/">Rubrique</a>`,
    ]
      .filter(Boolean)
      .join(' ');
    return page({
      title: `Carnet ${index}`,
      h1: `Carnet n&deg;${index}`,
      body: `${paragraphs(index, 3)}\n<p>${nav}</p>`,
      jsonLdType: 'Article',
    });
  }
  if (/^\/chambre-\d+\/$/.test(url)) {
    return page({
      title: url,
      h1: url,
      body: `<p><a href="/reservation/">R&eacute;server cette chambre</a></p>\n${paragraphs(url.length, 2)}`,
      jsonLdType: 'HotelRoom',
    });
  }
  if (
    /^\/prestation-\d+\/$/.test(url) ||
    /^\/lieu-\d+\/$/.test(url) ||
    /^\/type-chambre-\d+\/$/.test(url) ||
    /^\/tag-\d+\/$/.test(url)
  ) {
    return page({ title: url, h1: url, body: paragraphs(url.length, 2) });
  }
  if (/^\/categorie-\d+\/$/.test(url)) {
    const cat = Number(url.match(/^\/categorie-(\d+)\//)[1]);
    const body = `<p>${Array.from({ length: POSTS_PER_LISTING_PAGE }, (_, i) => {
      const postIndex = ((cat - 1) * POSTS_PER_LISTING_PAGE + i) % POSTS.length;
      return `<a href="/carnet-${postIndex + 1}/">carnet-${postIndex + 1}</a>`;
    }).join(' ')}</p>\n<p><a href="/categorie-${cat}/page/2/">page 2</a></p>`;
    return page({ title: url, h1: url, body });
  }
  if (/^\/categorie-\d+\/page\/\d+\/$/.test(url)) {
    const match = url.match(/^\/categorie-(\d+)\/page\/(\d+)\//);
    const cat = Number(match[1]);
    const pageN = Number(match[2]);
    const start = ((cat - 1) * 19 + (pageN - 1) * 30) % POSTS.length;
    const links = Array.from({ length: 30 }, (_, i) => {
      const postIndex = (start + i) % POSTS.length;
      return `<a href="/carnet-${postIndex + 1}/">carnet-${postIndex + 1}</a>`;
    }).join(' ');
    const next =
      pageN < 5 ? `<a href="/categorie-${cat}/page/${pageN + 1}/">page ${pageN + 1}</a>` : '';
    return page({ title: url, h1: url, body: `<p>${links}</p><p>${next}</p>` });
  }
  if (url === AUTHOR) {
    const links = POSTS.slice(0, 13)
      .map((p) => `<a href="${p}">${p}</a>`)
      .join(' ');
    return page({
      title: 'Auteur',
      h1: "Publications de l'auteur",
      body: `<p>${links}</p>\n<p><a href="${AUTHOR}page/2/">page 2</a></p>`,
    });
  }
  if (/^\/author\/auteur\/page\/\d+\/$/.test(url)) {
    const pageN = Number(url.match(/page\/(\d+)\//)[1]);
    const start = ((pageN - 1) * 13) % POSTS.length;
    const links = Array.from({ length: 13 }, (_, i) => {
      const postIndex = (start + i) % POSTS.length;
      return `<a href="/carnet-${postIndex + 1}/">carnet-${postIndex + 1}</a>`;
    }).join(' ');
    const next =
      pageN < AUTHOR_PAGES ? `<a href="${AUTHOR}page/${pageN + 1}/">page ${pageN + 1}</a>` : '';
    return page({ title: url, h1: url, body: `<p>${links}</p><p>${next}</p>` });
  }
  return null;
}

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const declaredUrls = [
  ...POSTS,
  ...STATIC_PAGES,
  ...ROOMS,
  ...AMENITIES,
  ...CATEGORIES,
  ...TAGS,
  ...LOCATIONS,
  ...ROOM_TYPES,
  AUTHOR,
];

if (EXPECTATIONS_PATH !== undefined) {
  writeFileSync(
    EXPECTATIONS_PATH,
    `${JSON.stringify(
      {
        origin: ORIGIN,
        declaredUrls,
        declaredCount: declaredUrls.length,
        seededDefects: {
          missingAlt: [...MISSING_ALT_PATHS],
          reservationNamelessButton: '/reservation/',
          reservationLowContrast: '/reservation/',
          headingOrder: '/a-propos/',
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`expectations written to ${EXPECTATIONS_PATH}`);
  process.exit(0);
}

const server = http.createServer((req, res) => {
  const path = new URL(req.url, ORIGIN).pathname;
  // The scanner normalizes page URLs to a single canonical form with no
  // trailing slash, so the same page must be reachable with and without
  // it. Extension-bearing routes (robots.txt, sitemaps, pixel.png) keep
  // their exact spelling.
  const route = path === '/' || /\.[a-z0-9]+$/i.test(path) ? path : `${path.replace(/\/+$/, '')}/`;
  const sendXml = (urls) => {
    const { body, type } = urlSetXml(urls);
    res.writeHead(200, { 'content-type': type });
    res.end(body);
  };
  if (route === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`User-agent: *\nDisallow:\nSitemap: ${ORIGIN}/sitemap_index.xml\n`);
    return;
  }
  if (route === '/sitemap_index.xml') {
    const { body, type } = sitemapIndexXml();
    res.writeHead(200, { 'content-type': type });
    res.end(body);
    return;
  }
  if (route === '/post-sitemap.xml') return sendXml(POSTS);
  if (route === '/page-sitemap.xml') return sendXml(STATIC_PAGES);
  if (route === '/room-sitemap.xml') return sendXml(ROOMS);
  if (route === '/amenity-sitemap.xml') return sendXml(AMENITIES);
  if (route === '/category-sitemap.xml') return sendXml(CATEGORIES);
  if (route === '/tag-sitemap.xml') return sendXml(TAGS);
  if (route === '/location-sitemap.xml') return sendXml(LOCATIONS);
  if (route === '/room-type-sitemap.xml') return sendXml(ROOM_TYPES);
  if (route === '/author-sitemap.xml') return sendXml([AUTHOR]);
  if (route === '/pixel.png') {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(PIXEL);
    return;
  }
  const html = render(route);
  if (html === null) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found\n');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fixture site serving ${declaredUrls.length} declared URLs on ${ORIGIN}`);
});
