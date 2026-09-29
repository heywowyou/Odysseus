// Reads one hotel website the way the prospect preparation needs: the home
// page, then up to five same-site legal, contact and privacy pages it links
// to. Plain HTTP with the identifiable bot user agent, robots.txt honoured,
// two seconds between requests. Read-only.
//   node .claude/skills/prepare-prospects/scripts/probe-site.mjs <url>
// Prints the checksum-valid SIRENs, ranked emails, phones and legal-notice
// excerpts found, with the page each came from.
import { isValidSiren, isValidSiret } from '../../../../packages/core/dist/compliance/siren.js';
import { roleAddressRank } from '../../../../packages/core/dist/prospecting/role-address.js';
import { USER_AGENT, htmlToText, sleep } from './lib.mjs';

const site = process.argv[2];
if (!site) {
  console.error('usage: probe-site.mjs <url>');
  process.exit(2);
}

async function get(url) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'fr' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    return { url: response.url, status: response.status, html: await response.text() };
  } catch (error) {
    return { url, status: 0, html: '', error: String(error.cause?.code ?? error.message) };
  }
}

function disallowedPaths(robots) {
  const rules = [];
  let applies = false;
  for (const line of robots.split('\n')) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*' || /odysseus/i.test(value);
    else if (applies && key === 'disallow' && value) rules.push(value);
  }
  return rules;
}

const home = await get(site);
if (home.status === 0 || home.status >= 400) {
  console.log(JSON.stringify({ site, unreachable: home.error ?? `HTTP ${home.status}` }));
  process.exit(0);
}
const origin = new URL(home.url).origin;
const siteDomain = new URL(home.url).hostname.replace(/^www\./, '');
const robots = await get(`${origin}/robots.txt`);
const disallowed = robots.status === 200 ? disallowedPaths(robots.html) : [];

const pages = [{ path: new URL(home.url).pathname, html: home.html }];
const links = [...home.html.matchAll(/href=["']([^"'#]+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)];
const wanted = /mentions|legal|l[ée]gales|imprint|cgv|conditions|contact|confidentialit|privacy/i;
const seen = new Set([pages[0].path]);
for (const [, href, label] of links) {
  if (!wanted.test(`${href} ${htmlToText(label)}`)) continue;
  let url;
  try {
    url = new URL(href, home.url);
  } catch {
    continue;
  }
  if (url.origin !== origin || seen.has(url.pathname) || /\.pdf$/i.test(url.pathname)) continue;
  if (seen.size > 5) break;
  seen.add(url.pathname);
  if (disallowed.some((rule) => url.pathname.startsWith(rule))) continue;
  await sleep(2000);
  const page = await get(url.href);
  if (page.status === 200) pages.push({ path: url.pathname, html: page.html });
}

const sirens = new Map();
const emails = new Map();
const phones = new Map();
const legal = [];
for (const { path, html } of pages) {
  const text = htmlToText(html);
  const add = (map, key) => map.has(key) || map.set(key, path);
  for (const [, digits] of text.matchAll(/(?:SIRE[NT]|RCS|R\.C\.S\.?|immatricul|TVA[^0-9]{0,30}FR\s?\d{2})[^0-9]{0,40}((?:\d[\s.]?){9,14})/gi)) {
    const value = digits.replace(/\D/g, '');
    if (value.length >= 14 && isValidSiret(value.slice(0, 14))) add(sirens, value.slice(0, 9));
    else if (isValidSiren(value.slice(0, 9))) add(sirens, value.slice(0, 9));
  }
  for (const [address] of htmlToText(html.replace(/mailto:/gi, ' ')).matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
    const lower = address.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|svg)$|@\d|sentry|wixpress|example\./.test(lower)) continue;
    add(emails, lower);
  }
  for (const [phone] of text.matchAll(/(?:\+33\s?\(?0?\)?\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g)) add(phones, phone.trim());
  for (const [snippet] of text.matchAll(/.{0,100}(?:[ée]dit[ée] par|raison sociale|d[ée]nomination|soci[ée]t[ée]\s*:|forme juridique|\bSAS\b|\bSARL\b|\bEURL\b|\bSASU\b|\bSNC\b).{0,120}/gi)) {
    if (legal.length < 6) legal.push(`${path}: ${snippet.trim()}`);
  }
}

const rankedEmails = [...emails]
  .map(([address, path]) => {
    const [local, domain] = address.split('@');
    const ownDomain = domain === siteDomain || domain.endsWith(`.${siteDomain}`);
    return { address, path, ownDomain, roleRank: roleAddressRank(local) };
  })
  .sort(
    (a, b) =>
      Number(b.ownDomain) - Number(a.ownDomain) ||
      (a.roleRank ?? 99) - (b.roleRank ?? 99),
  );

console.log(
  JSON.stringify(
    {
      site,
      finalUrl: home.url,
      pagesRead: pages.map((page) => page.path),
      sirens: [...sirens].map(([siren, path]) => ({ siren, path })),
      emails: rankedEmails,
      phones: [...phones].slice(0, 6).map(([phone, path]) => ({ phone, path })),
      legal,
    },
    null,
    1,
  ),
);
