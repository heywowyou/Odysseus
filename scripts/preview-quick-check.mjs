// The mechanical half of the audit-finalizer's preview quick check (Q1 to
// Q4): fetch the preview and its bundle, run the data quality measure on the
// stored audit, reconcile the printed figures, and print each card's
// representative finding with samples. The verdict stays the operator's
// agent's: this prints what to read, it decides nothing.
//
// Usage (from the repository root, after `pnpm build`):
//   node scripts/preview-quick-check.mjs <auditId> [<auditId> ...]
//   node scripts/preview-quick-check.mjs --uncontacted
//
// --uncontacted checks the newest completed Full scan of every prospect whose
// status is still `new` or `audited`. Read-only: GET requests, the read-only
// measure in the app container, and local files under reports/check-*.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expectedPreviewFigures, previewFigureMismatches } from './lib/preview-check-figures.mjs';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const { reportPopulation } = await import(
  pathToFileURL(join(repoRoot, 'packages/core/dist/index.js')).href
);
const { buildRenderedPriorities } = await import(
  pathToFileURL(join(repoRoot, 'packages/report/dist/index.js')).href
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function dashboardGet(path) {
  const { stdout } = run('node', ['scripts/dashboard-request.mjs', 'GET', path]);
  const body = stdout.slice(stdout.indexOf('\n') + 1);
  return JSON.parse(body);
}

function uncontactedAuditIds() {
  const prospects = dashboardGet('/api/prospects?hasScan=true&pageSize=500').rows;
  const wanted = new Set(
    prospects
      .filter((row) => row.status === 'new' || row.status === 'audited')
      .map((row) => row.prospectId),
  );
  const scans = dashboardGet('/api/scans?limit=500');
  const jobs = Array.isArray(scans) ? scans : scans.jobs;
  const newest = new Map();
  for (const job of jobs) {
    if (job.type !== 'full-audit' || job.status !== 'complete' || !job.auditId) continue;
    if (!wanted.has(job.prospectId)) continue;
    const current = newest.get(job.prospectId);
    if (!current || job.finishedAt > current.finishedAt) newest.set(job.prospectId, job);
  }
  return [...newest.values()]
    .sort((left, right) => (left.finishedAt < right.finishedAt ? 1 : -1))
    .map((job) => job.auditId);
}

function runDirectory(startedAt) {
  return startedAt.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

function measureAlerts(host, startedAt) {
  const { stdout } = run('scripts/vps-app.sh', [
    'node',
    '/app/scripts/measure-audit-data-quality.mjs',
    `/data/artifacts/${host}/${runDirectory(startedAt)}`,
  ]);
  try {
    const parsed = JSON.parse(stdout.slice(stdout.indexOf('{')));
    const audit = parsed.audits?.[0] ?? {};
    return {
      alerts: parsed.alerts ?? [],
      replayDrift: `${audit.before?.findings} -> ${audit.after?.findings}`,
    };
  } catch {
    return { alerts: [`measure failed: ${stdout.slice(0, 200)}`], replayDrift: 'unknown' };
  }
}

function sample(element) {
  const snippet = (element.snippet ?? '').replace(/\s+/g, ' ').slice(0, 160);
  return `    - ${element.pageUrl} | ${(element.selector ?? '').slice(0, 90)} | ${snippet}`;
}

function checkOne(auditId) {
  const audit = dashboardGet(`/api/audits/${auditId}`);
  const host = new URL(audit.siteUrl).hostname;
  const dir = join(repoRoot, 'reports', `check-${host}-${auditId.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  const fetched = run('node', ['scripts/fetch-client-report.mjs', auditId, dir, 'fr', 'preview']);
  const lines = [`# ${audit.prospect?.name ?? host} (${auditId.slice(0, 8)}) ${audit.siteUrl}`];
  lines.push(
    `scan ${audit.startedAt} | findingsStale=${audit.findingsStale} | livePreview=${audit.outreach?.hasLivePreview}`,
  );
  if (!existsSync(join(dir, 'preview.pdf'))) {
    lines.push(
      `HOLD (4): preview not fetched: ${(fetched.stdout + fetched.stderr).trim().slice(-300)}`,
    );
    return lines.join('\n');
  }
  const read = (file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const manifest = read('bundle-fr/manifest.json');
  const findings = read('bundle-fr/findings.json');
  const analysis = read('bundle-fr/analysis.json');
  const population = reportPopulation(manifest, findings);

  const { alerts, replayDrift } = measureAlerts(host, audit.startedAt);
  lines.push(
    `alerts: ${alerts.length === 0 ? 'none' : alerts.join(' || ')} | replay ${replayDrift}`,
  );
  const statuses = {};
  for (const page of manifest.pages) statuses[page.status] = (statuses[page.status] ?? 0) + 1;
  const homepage = manifest.crawl.homepageUrl ?? manifest.crawl.startUrl;
  lines.push(
    `pages: ${JSON.stringify(statuses)} | homepage ${homepage} -> ${manifest.pages.find((page) => page.url === homepage)?.status}`,
  );

  const previewText = run('pdftotext', ['-layout', join(dir, 'preview.pdf'), '-']).stdout;
  const expected = expectedPreviewFigures({
    coverageSummary: audit.coverageSummary,
    primaryFindings: population.primary,
  });
  const mismatches = previewFigureMismatches(expected, previewText);
  lines.push(`figures: ${mismatches.length === 0 ? 'all match' : mismatches.join('; ')}`);

  const priorities = buildRenderedPriorities(analysis.themes, findings, manifest, 'fr').slice(0, 3);
  priorities.forEach((priority, index) => {
    const finding = priority.evidence.representativeFinding;
    lines.push(
      `card ${index + 1}: ${priority.theme?.title ?? ''} | ${finding.findingId} ${finding.ruleId} ${finding.severity} (${finding.source}) | ${priority.evidence.uniquePageCount} pages`,
    );
    lines.push(`    ${finding.description.slice(0, 220)}`);
    const elements = finding.elements ?? [];
    if (elements.length > 0) lines.push(...elements.slice(0, 2).map(sample));
    else lines.push(`    pages: ${finding.pageUrls.slice(0, 3).join(' ')}`);
  });

  const assessment = analysis.obligationAssessment;
  const facts = (assessment?.basis ?? []).flatMap((basis) => basis.facts ?? []);
  lines.push(
    `obligation: ${assessment?.status ?? 'none'} | ${facts.map((fact) => fact.label ?? fact.kind).join(', ')} | registrySnapshot=${assessment?.registrySnapshot ? 'present' : 'absent'}`,
  );
  const block = previewText.slice(
    previewText.indexOf('Cadre réglementaire'),
    previewText.indexOf('Le diagnostic complet'),
  );
  lines.push(`block: ${block.replace(/\s+/g, ' ').slice(0, 600)}`);
  lines.push(`dashes: ${(previewText.match(/[–—]/g) ?? []).length}`);
  const summary = lines.join('\n');
  writeFileSync(join(dir, 'quick-check.txt'), `${summary}\n`, { mode: 0o600 });
  return summary;
}

const args = process.argv.slice(2);
const auditIds = args[0] === '--uncontacted' ? uncontactedAuditIds() : args;
if (auditIds.length === 0) {
  console.error('usage: preview-quick-check.mjs <auditId> [...] | --uncontacted');
  process.exit(2);
}
console.log(`checking ${auditIds.length} audit(s)`);
for (const auditId of auditIds) {
  try {
    console.log(`${checkOne(auditId)}\n`);
  } catch (error) {
    console.log(`# ${auditId}\nfailed: ${error instanceof Error ? error.message : error}\n`);
  }
}
