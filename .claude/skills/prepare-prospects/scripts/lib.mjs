// Shared helpers for the prepare-prospects skill scripts. Run every script
// from the repository root: the dashboard password is read from the
// repository .env (read-only) and never printed.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export const DASHBOARD_URL = 'https://app.odysseusaudit.com';
export const USER_AGENT = 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)';
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Logs in once, runs `work(request)`, and always logs out. */
export async function withDashboard(work) {
  const password = parseEnv(readFileSync('.env', 'utf8')).ODYSSEUS_DASHBOARD_PASSWORD;
  if (!password) throw new Error('ODYSSEUS_DASHBOARD_PASSWORD is not set in .env');
  const login = await fetch(`${DASHBOARD_URL}/api/session/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!login.ok) throw new Error(`dashboard login failed: HTTP ${login.status}`);
  const cookie = login.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  const request = async (method, path, body) => {
    const response = await fetch(`${DASHBOARD_URL}${path}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 300)}`);
    return json;
  };
  try {
    return await work(request);
  } finally {
    await fetch(`${DASHBOARD_URL}/api/session/logout`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
  }
}

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: "'", lsquo: "'", ndash: '-', mdash: '-', hellip: '...' };

/** HTML to plain text, decoding named and numeric entities. */
export function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => {
      const lower = name.toLowerCase();
      if (lower in ENTITIES) return ENTITIES[lower];
      const accented = /^([a-z])(acute|grave|circ|uml|cedil)$/i.exec(name);
      return accented ? decodeAccent(accented[1], accented[2]) : entity;
    })
    .replace(/\s+/g, ' ');
}

const MARKS = { acute: '́', grave: '̀', circ: '̂', uml: '̈', cedil: '̧' };
function decodeAccent(letter, mark) {
  return `${letter}${MARKS[mark.toLowerCase()]}`.normalize('NFC');
}
