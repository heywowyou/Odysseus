// One authenticated request to the operator dashboard API, for the
// audit-finalizer skill and other operator workflows. Usage (from the
// repository root):
//   node scripts/dashboard-request.mjs <GET|POST|PATCH> <path> [json-body]
//
// Logs in with ODYSSEUS_DASHBOARD_PASSWORD from the repository .env, which it
// only reads, sends the request, prints the HTTP status and the response body,
// then logs out. The session cookie stays in memory and no secret is printed.
// A POST or PATCH is a production write: the caller decides it is wanted (a
// rescan of an audited site, a report regeneration, a prospect correction
// such as a website that moved to another domain); this script adds no guard
// of its own beyond refusing any other method.
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { parseEnv } from 'node:util';

const DASHBOARD_URL = 'https://app.odysseusaudit.com';

const [method, path, body = '{}'] = process.argv.slice(2);
const WRITE_METHODS = new Set(['POST', 'PATCH']);
if ((method !== 'GET' && !WRITE_METHODS.has(method)) || !path?.startsWith('/api/')) {
  console.error('usage: dashboard-request.mjs <GET|POST|PATCH> </api/...> [json-body]');
  process.exit(2);
}
if (WRITE_METHODS.has(method)) {
  try {
    JSON.parse(body);
  } catch {
    console.error('the body must be JSON');
    process.exit(2);
  }
}

const password = parseEnv(readFileSync('.env', 'utf8')).ODYSSEUS_DASHBOARD_PASSWORD;
if (!password) {
  console.error('ODYSSEUS_DASHBOARD_PASSWORD is not set in .env');
  process.exit(1);
}

const login = await fetch(`${DASHBOARD_URL}/api/session/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password }),
});
if (!login.ok) {
  console.error(`dashboard login failed: HTTP ${login.status}`);
  process.exit(1);
}
const cookie = login.headers
  .getSetCookie()
  .map((header) => header.split(';')[0])
  .join('; ');

// node:https without a socket timeout: a report regeneration answers only
// when the writing pass and the PDFs are done, which takes minutes and
// outlives fetch's default headers timeout.
function send() {
  return new Promise((resolve, reject) => {
    const payload = WRITE_METHODS.has(method) ? Buffer.from(body) : undefined;
    const req = request(
      `${DASHBOARD_URL}${path}`,
      {
        method,
        headers: {
          cookie,
          ...(payload !== undefined
            ? { 'content-type': 'application/json', 'content-length': payload.length }
            : {}),
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, text }));
      },
    );
    req.setTimeout(0);
    req.on('error', reject);
    req.end(payload);
  });
}

let status;
try {
  const response = await send();
  status = response.status;
  console.log(`HTTP ${response.status}`);
  console.log(response.text);
} finally {
  await fetch(`${DASHBOARD_URL}/api/session/logout`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: '{}',
  });
}
process.exit(status >= 200 && status < 300 ? 0 : 1);
