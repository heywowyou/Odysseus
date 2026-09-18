import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const plansDir = resolve(repoRoot, 'plans');
const errors = [];

const rootPlanNames = readdirSync(plansDir)
  .filter((name) => /^\d{3}-.+\.md$/.test(name))
  .filter((name) => !name.startsWith('059-'));

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

for (const name of rootPlanNames) {
  const path = `plans/${name}`;
  const contents = read(path);

  if (!/Definition of done/i.test(contents)) {
    errors.push(`${path} must contain a Definition of done.`);
  }
  if (!/Executable closure contract/i.test(contents)) {
    errors.push(`${path} must contain an Executable closure contract.`);
  }
  if (!/requirement-to-proof/i.test(contents)) {
    errors.push(`${path} must require a requirement-to-proof closure artifact.`);
  }

  const statusMatch = contents.match(
    /(?:^|\n)(?:Status:\s*|[-*]\s*\*\*Execution status:\*\*\s*)([^\n]+)/i,
  );
  if (statusMatch?.[1]?.includes('DONE') && !/Closure evidence:/i.test(contents)) {
    errors.push(`${path} is DONE but has no committed "Closure evidence:" record.`);
  }
}

const plan058 = read('plans/058-fail-closed-senior-report-quality-pipeline.md');
for (const required of [
  'ReportModelProfile',
  'gpt-5.6-sol',
  'OPENAI_MODEL',
  'gpt-5.4-mini',
  'role-profile coverage test',
]) {
  if (!plan058.includes(required)) {
    errors.push(`Plan 058 must retain its model-profile ratchet: missing "${required}".`);
  }
}
if (
  /single generic report-quality model setting is not a role-profile implementation/.test(
    plan058,
  ) === false
) {
  errors.push('Plan 058 must explicitly reject a single generic report-quality model setting.');
}

const reportProfileSource = read('packages/llm/src/report-model-profiles.ts');
const reportQualityClientSource = read('packages/llm/src/report-quality-client.ts');
const reportQualityPipelineSource = read(
  'packages/interface/src/pipeline/report-quality-pipeline.ts',
);
const reportProfileTestSource = read('packages/llm/src/report-model-profiles.test.ts');

for (const [sourceName, source] of [
  ['report-model-profiles.ts', reportProfileSource],
  ['report-quality-client.ts', reportQualityClientSource],
  ['report-quality-pipeline.ts', reportQualityPipelineSource],
]) {
  for (const forbidden of ['ODYSSEUS_REPORT_QUALITY_MODEL', 'OPENAI_MODEL', 'gpt-5.4-mini']) {
    if (source.includes(forbidden)) {
      errors.push(`${sourceName} reintroduces forbidden Plan-058 fallback "${forbidden}".`);
    }
  }
}
if (
  !reportProfileSource.includes("model: 'gpt-5.6-sol'") &&
  !reportProfileSource.includes('model: SOL')
) {
  errors.push('Plan-058 model profiles must retain the gpt-5.6-sol quality-first candidate.');
}
if (!reportProfileSource.includes('satisfies Record<ReportQualityRole, ReportModelProfile>')) {
  errors.push('Plan-058 role/profile registry must remain compile-time exhaustive.');
}
if (!reportProfileTestSource.includes('covers every report-quality role')) {
  errors.push('Plan-058 role-profile coverage test must remain present.');
}

const plan051 = read('plans/archive/051-findings-delta-reaudit.md');
if (!plan051.includes('@odysseus/llm') || !/no import or call edge/i.test(plan051)) {
  errors.push('Plan 051 must retain the static no-LLM dependency proof.');
}

const plan063 = read('plans/archive/063-dashboard-data-contracts-and-large-audit-performance.md');
for (const budget of [
  '<= 200 KiB',
  '<= 25 database queries',
  '<= 100 rows',
  '<= 250',
  '500 ms p95',
]) {
  if (!plan063.includes(budget)) {
    errors.push(`Plan 063 must retain numeric performance budget "${budget}".`);
  }
}

const plan064 = read('plans/archive/064-dashboard-accessibility-and-design-system.md');
for (const required of ['WCAG 2.2 AA', 'manual acceptance artifact', '400% zoom']) {
  if (!plan064.includes(required)) {
    errors.push(`Plan 064 must retain accessibility closure requirement "${required}".`);
  }
}

const plan066 = read('plans/archive/066-operator-security-privacy-and-browser-isolation.md');
for (const required of [
  'browser-isolation proof record',
  'negative tests prove',
  'arbitrary external network access',
]) {
  if (!plan066.includes(required)) {
    errors.push(`Plan 066 must retain security closure requirement "${required}".`);
  }
}

const policy = read('docs/agents/plan-quality-gates.md');
const numberedSafeguards = [...policy.matchAll(/^\d+\. \*\*/gm)].length;
if (numberedSafeguards !== 10) {
  errors.push(
    `docs/agents/plan-quality-gates.md must contain exactly 10 numbered mandatory safeguards; found ${numberedSafeguards}.`,
  );
}

const packageJson = JSON.parse(read('package.json'));
if (!packageJson.scripts?.['plans:check']) {
  errors.push('package.json must define plans:check.');
}
if (!packageJson.scripts?.check?.includes('plans:check')) {
  errors.push('package.json check must run plans:check.');
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Plan quality check passed (${rootPlanNames.length} executable root plans; Plan 059 excluded by active handoff).\n`,
  );
}
