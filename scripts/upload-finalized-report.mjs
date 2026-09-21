// Uploads the operator's finalized report PDF back to the hosted dashboard,
// where it becomes the audit's current deliverable. Usage (from the
// repository root):
//   node scripts/upload-finalized-report.mjs <finalPdf> [overridesFile]
//
// Reads the lineage and the measured page count out of the sidecar
// `report:finalize` wrote next to the PDF, so the upload always describes the
// exact file it is sending and the analysis the corrections were actually
// written against - never a hand-typed digest, never a page count guessed
// back out of the bytes. The dashboard answers 409 when the analysis or the
// findings have been regenerated since, which is the check that stops a
// superseded report reaching a client.
//
// Logs in with ODYSSEUS_DASHBOARD_PASSWORD from the repository .env and logs
// out afterwards. The session cookie stays in memory and no secret is
// printed. This is the one script in the finalizer workflow that writes:
// everything before it is read-only.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';

const DASHBOARD_URL = 'https://app.odysseusaudit.com';

const [pdfArg, overridesArg, ...rest] = process.argv.slice(2);
if (!pdfArg || rest.length > 0) {
  console.error('usage: upload-finalized-report.mjs <finalPdf> [overridesFile]');
  process.exit(2);
}

const password = parseEnv(readFileSync('.env', 'utf8')).ODYSSEUS_DASHBOARD_PASSWORD;
if (!password) {
  console.error('ODYSSEUS_DASHBOARD_PASSWORD is not set in .env');
  process.exit(1);
}

const pdfPath = resolve(pdfArg);
const meta = JSON.parse(readFileSync(`${pdfPath}.meta.json`, 'utf8'));
const { lineage } = meta;
const pdf = readFileSync(pdfPath);
if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
  console.error(`${pdfArg} is not a PDF`);
  process.exit(1);
}
let lightVariant;
if (meta.variants?.light) {
  const lightPath = resolve(dirname(`${pdfPath}.meta.json`), meta.variants.light.path);
  const lightPdf = readFileSync(lightPath);
  if (lightPdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    console.error(`${lightPath} is not a PDF`);
    process.exit(1);
  }
  lightVariant = {
    pdfBase64: lightPdf.toString('base64'),
    ...(typeof meta.variants.light.pageCount === 'number'
      ? { pageCount: meta.variants.light.pageCount }
      : {}),
  };
}
const overrides =
  overridesArg === undefined ? null : JSON.parse(readFileSync(resolve(overridesArg), 'utf8'));

const body = {
  lineage: {
    auditId: lineage.auditId,
    language: lineage.language,
    analysisId: lineage.analysisId,
    analysisDigest: lineage.analysisDigest,
    findingsDigest: lineage.findingsProvenance.findingsDigest,
  },
  overrides,
  pdfBase64: pdf.toString('base64'),
  // The bundle's lineage records the build that rendered the hosted PDF; the
  // sidecar records the local build that rendered the finalized one, which is
  // the point of finalizing at all.
  rendererBuild: meta.rendererBuild,
  reportTemplateVersion: meta.reportTemplateVersion,
  ...(typeof meta.pageCount === 'number' ? { pageCount: meta.pageCount } : {}),
  ...(lightVariant === undefined ? {} : { variants: { light: lightVariant } }),
};

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

let failed = false;
try {
  const response = await fetch(
    `${DASHBOARD_URL}/api/audits/${lineage.auditId}/report/${lineage.language}/finalized`,
    {
      method: 'POST',
      // Exactly this content type: the router's CSRF guard requires it on
      // every state-changing route, which is why the PDF travels base64.
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  if (response.status !== 201) {
    console.error(`upload refused: HTTP ${response.status} ${text.slice(0, 500)}`);
    failed = true;
  } else {
    const created = JSON.parse(text);
    console.log(
      `finalized ${lineage.language.toUpperCase()} report stored: ${created.reportId}\n` +
        `  corrections: ${created.overrideCount}\n` +
        `  supersedes:  ${created.supersedesReportId}\n` +
        `  pdf sha256:  ${createHash('sha256').update(pdf).digest('hex')}` +
        (lightVariant === undefined
          ? ''
          : `\n  light sha256: ${createHash('sha256')
              .update(
                readFileSync(resolve(dirname(`${pdfPath}.meta.json`), meta.variants.light.path)),
              )
              .digest('hex')}`),
    );
    console.log('The dashboard now shows this row as finalized. Approve it there before delivery.');
  }
} finally {
  await fetch(`${DASHBOARD_URL}/api/session/logout`, { method: 'POST', headers: { cookie } });
}
process.exit(failed ? 1 : 0);
