// Read-only retrieval of one hosted audit's current report for the
// client-report-finalizer skill. Usage (from the repository root):
//   node scripts/fetch-client-report.mjs <auditId> <outDir> [fr|en ...]
//
// Logs into the operator dashboard with ODYSSEUS_DASHBOARD_PASSWORD from the
// repository .env, downloads the audit record, the report-quality lineage and
// the fresh report PDF for each requested language (French by default), then
// logs out. It only issues GET requests besides the session login/logout, so
// it never rescans, regenerates, approves or publishes anything. The session
// cookie stays in memory and no secret is printed.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const DASHBOARD_URL = 'https://app.odysseusaudit.com';
const AUDIT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const [auditId, outDirArg, ...languageArgs] = process.argv.slice(2);
const languages = languageArgs.length > 0 ? languageArgs : ['fr'];
if (
  !auditId ||
  !outDirArg ||
  !AUDIT_ID_PATTERN.test(auditId) ||
  languages.some((language) => language !== 'fr' && language !== 'en')
) {
  console.error('usage: fetch-client-report.mjs <auditId> <outDir> [fr|en ...]');
  process.exit(2);
}

const password = parseEnv(readFileSync('.env', 'utf8')).ODYSSEUS_DASHBOARD_PASSWORD;
if (!password) {
  console.error('ODYSSEUS_DASHBOARD_PASSWORD is not set in .env');
  process.exit(1);
}

const outDir = resolve(outDirArg);
mkdirSync(outDir, { recursive: true, mode: 0o700 });

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

async function get(path) {
  const response = await fetch(`${DASHBOARD_URL}${path}`, { headers: { cookie } });
  return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
}

let failed = false;
try {
  for (const [name, path] of [
    ['audit.json', `/api/audits/${auditId}`],
    ['report-quality.json', `/api/audits/${auditId}/report-quality`],
  ]) {
    const { status, body } = await get(path);
    if (status !== 200) {
      console.error(`${name}: HTTP ${status} ${body.toString('utf8').slice(0, 200)}`);
      failed = true;
      continue;
    }
    writeFileSync(join(outDir, name), body, { mode: 0o600 });
    console.log(`${name}: ${body.length} bytes`);
  }
  for (const language of languages) {
    const { status, body } = await get(`/api/audits/${auditId}/report/${language}/preview`);
    if (status !== 200) {
      console.error(`${language}.pdf: HTTP ${status} ${body.toString('utf8').slice(0, 200)}`);
      failed = true;
      continue;
    }
    const file = join(outDir, `${language}.pdf`);
    writeFileSync(file, body, { mode: 0o600 });
    const digest = createHash('sha256').update(body).digest('hex');
    console.log(`${language}.pdf: sha256:${digest} ${file}`);
  }
} finally {
  await fetch(`${DASHBOARD_URL}/api/session/logout`, { method: 'POST', headers: { cookie } });
}
process.exit(failed ? 1 : 0);
