// Read-only retrieval of one hosted audit's current report for the
// audit-finalizer skill. Usage (from the repository root):
//   node scripts/fetch-client-report.mjs <auditId> <outDir> [fr|en|preview ...]
//
// Logs into the operator dashboard with ODYSSEUS_DASHBOARD_PASSWORD from the
// repository .env, downloads the audit record, the report-quality lineage, the
// fresh report PDF and the render bundle for each requested language (French
// by default), then logs out. It only issues GET requests besides the session
// login/logout, so it never rescans, regenerates, approves or publishes
// anything. The session cookie stays in memory and no secret is printed.
//
// Plan 072: the render bundle is the full working set a finalization needs -
// the manifest, findings, analysis and render inputs the hosted PDF was built
// from, unpacked one file per member so the operator can read and later diff
// them. `odysseus report:finalize` renders from that directory; the hosted PDF
// beside it is the baseline being corrected.
//
// `preview` fetches the outreach preview the audit would publish, as the
// operator-only render (`preview.html` and `preview.pdf`), or prints why the
// audit cannot have one yet. It reads; it never publishes.
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
  languages.some((language) => !['fr', 'en', 'preview'].includes(language))
) {
  console.error('usage: fetch-client-report.mjs <auditId> <outDir> [fr|en|preview ...]');
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
  if (languages.includes('preview')) {
    const { status, body } = await get(`/api/audits/${auditId}/outreach-preview`);
    const outcome = status === 200 ? JSON.parse(body.toString('utf8')) : undefined;
    if (outcome?.rendered === true) {
      writeFileSync(join(outDir, 'preview.html'), outcome.html, { mode: 0o600 });
      console.log(`preview.html: ${Buffer.byteLength(outcome.html)} bytes`);
      const pdf = await get(`/api/audits/${auditId}/outreach-preview/pdf`);
      if (pdf.status === 200) {
        writeFileSync(join(outDir, 'preview.pdf'), pdf.body, { mode: 0o600 });
        console.log(`preview.pdf: sha256:${createHash('sha256').update(pdf.body).digest('hex')}`);
      } else {
        console.error(`preview.pdf: HTTP ${pdf.status}`);
        failed = true;
      }
    } else if (outcome?.rendered === false) {
      console.error(`preview: refused ${JSON.stringify(outcome.refusal)}`);
      failed = true;
    } else {
      console.error(`preview: HTTP ${status} ${body.toString('utf8').slice(0, 200)}`);
      failed = true;
    }
  }
  for (const language of languages.filter((language) => language !== 'preview')) {
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

    const bundle = await get(`/api/audits/${auditId}/render-bundle/${language}`);
    if (bundle.status !== 200) {
      console.error(
        `bundle-${language}: HTTP ${bundle.status} ${bundle.body.toString('utf8').slice(0, 200)}`,
      );
      failed = true;
      continue;
    }
    // Unpacked into one file per member, the same split
    // readRenderBundleDir expects. Keeping a combined copy beside them would
    // be a second source of truth for the same thing.
    const { lineage, manifest, findings, analysis, ...renderInputs } = JSON.parse(
      bundle.body.toString('utf8'),
    );
    const bundleDir = join(outDir, `bundle-${language}`);
    mkdirSync(bundleDir, { recursive: true, mode: 0o700 });
    for (const [name, value] of [
      ['lineage.json', lineage],
      ['manifest.json', manifest],
      ['findings.json', findings],
      ['analysis.json', analysis],
      ['render-inputs.json', renderInputs],
    ]) {
      const bundleFile = join(bundleDir, name);
      const serialized = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
      writeFileSync(bundleFile, serialized, { mode: 0o600 });
      console.log(
        `bundle-${language}/${name}: sha256:${createHash('sha256').update(serialized).digest('hex')}`,
      );
    }
    // The digests the override file has to repeat, printed so the operator
    // does not have to open the lineage to write one.
    console.log(
      `bundle-${language}: analysisDigest ${lineage.analysisDigest} findingsDigest ${lineage.findingsProvenance.findingsDigest}`,
    );
  }
} finally {
  await fetch(`${DASHBOARD_URL}/api/session/logout`, { method: 'POST', headers: { cookie } });
}
process.exit(failed ? 1 : 0);
