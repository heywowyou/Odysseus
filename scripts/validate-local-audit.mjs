// Validate the local-fixture audit manifest + findings against the
// fixture's ground truth. Usage (from the repository root):
//   node /tmp/validate-fixture-audit.mjs <auditDir> <expectations.json>
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [auditDir, expectationsPath] = process.argv.slice(2);
if (!auditDir || !expectationsPath) {
  console.error('usage: validate-fixture-audit.mjs <auditDir> <expectations.json>');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(join(auditDir, 'manifest.json'), 'utf8'));
const findings = JSON.parse(readFileSync(join(auditDir, 'findings.json'), 'utf8'));
const expectations = JSON.parse(readFileSync(expectationsPath, 'utf8'));
const declared = new Set(expectations.declaredUrls);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!ok) failures += 1;
};

// 1. Sitemap coverage fields
const sc = manifest.crawl?.sitemapCoverage ?? {};
check(
  'sitemap declaredPageCount == 521',
  sc.declaredPageCount === expectations.declaredCount,
  `got ${sc.declaredPageCount}`,
);
check(
  'sitemap eligiblePageCount == 521',
  sc.eligiblePageCount === expectations.declaredCount,
  `got ${sc.eligiblePageCount}`,
);

// 2. Every declared URL inventoried as visited (the manifest stores
// canonical URLs without trailing slashes; compare in that form)
const canon = (p) => (p === '/' ? '/' : p.replace(/\/+$/, ''));
const pagesByPath = new Map((manifest.pages ?? []).map((p) => [canon(new URL(p.url).pathname), p]));
const declaredCanon = [...declared].map(canon);
const missing = declaredCanon.filter((u) => !pagesByPath.has(u));
check(
  'every declared URL has a manifest entry',
  missing.length === 0,
  missing.length ? `missing ${missing.slice(0, 5).join(', ')}` : '',
);
const notVisited = declaredCanon.filter((u) => pagesByPath.get(u)?.status !== 'visited');
check(
  'every declared URL visited',
  notVisited.length === 0,
  notVisited.length ? `not visited: ${notVisited.slice(0, 5).join(', ')}` : '',
);

// 3. Content passes universal (with watchdog failures surfaced separately)
const visitedDeclared = declaredCanon.map((u) => pagesByPath.get(u)).filter(Boolean);
const cov = (p) => p.analysisCoverage;
const passOutcome = (p, pass) => cov(p)?.passes?.[pass]?.outcome;
const noCoverage = visitedDeclared.filter((p) => !cov(p));
check(
  'every declared page has analysisCoverage',
  noCoverage.length === 0,
  `${noCoverage.length} without`,
);
for (const pass of ['rendered', 'axe', 'extended']) {
  const completed = visitedDeclared.filter((p) => passOutcome(p, pass) === 'completed').length;
  const failed = visitedDeclared.filter((p) => passOutcome(p, pass) === 'failed').length;
  const other = visitedDeclared.length - completed - failed;
  check(
    `content pass "${pass}" completed on all declared pages`,
    failed === 0 && other === 0,
    `completed=${completed} failed=${failed} other=${other}`,
  );
}

// 4. Lighthouse bounded + planned skips disclosed
const lhCompleted = visitedDeclared.filter(
  (p) => passOutcome(p, 'lighthouse') === 'completed',
).length;
const lhNotPlanned = visitedDeclared.filter(
  (p) => passOutcome(p, 'lighthouse') === 'not-planned',
).length;
const lhFailed = visitedDeclared.filter((p) => passOutcome(p, 'lighthouse') === 'failed').length;
check(
  'lighthouse is a disclosed bounded sample, not per-page',
  lhCompleted > 0 &&
    lhCompleted + lhNotPlanned + lhFailed === visitedDeclared.length &&
    lhCompleted < visitedDeclared.length &&
    lhFailed === 0,
  `completed=${lhCompleted} failed=${lhFailed} not-planned=${lhNotPlanned} of ${visitedDeclared.length}`,
);

// 5. Watchdog disclosures
const watchdogged = (manifest.pages ?? []).filter(
  (p) =>
    p.errors &&
    Object.values(p.errors).some((e) => typeof e === 'string' && e.includes('watchdog')),
);
check(
  'no watchdog abandons',
  watchdogged.length === 0,
  watchdogged.length ? watchdogged.map((p) => p.url).join(', ') : '',
);

// 6. Continuation guard: disclosed, and never omits a declared URL
const guard = manifest.continuationGuardSummary ?? null;
console.log(`INFO  continuation guard: ${JSON.stringify(guard)}`);
const declaredCanonSet = new Set(declaredCanon);
const discovered = (manifest.pages ?? []).filter(
  (p) => !declaredCanonSet.has(canon(new URL(p.url).pathname)),
);
console.log(`INFO  link-discovered non-declared URLs inventoried: ${discovered.length}`);

// 7. Seeded defects present in findings.json with the right reach
const findRule = (ruleId, urlFragment) =>
  findings.filter(
    (f) => f.ruleId === ruleId && (!urlFragment || f.pageUrls.some((u) => u.includes(urlFragment))),
  );
const altFindings = findRule('image-alt');
const altPages = new Set(
  altFindings.flatMap((f) => f.pageUrls.map((u) => canon(new URL(u).pathname))),
);
const expectedAlt = new Set(expectations.seededDefects.missingAlt.map(canon));
check(
  'image-alt finding covers exactly the 4 seeded pages',
  altPages.size === expectedAlt.size && [...expectedAlt].every((u) => altPages.has(u)),
  `found pages: ${[...altPages].join(', ') || 'none'}`,
);
check(
  'nameless button on /reservation surfaced',
  findRule('button-name', '47813/reservation').length > 0,
  'ruleId=button-name',
);
check(
  'low contrast on /reservation surfaced',
  findRule('color-contrast', '47813/reservation').length > 0,
  'ruleId=color-contrast',
);
check(
  'heading-order on /a-propos surfaced',
  findRule('heading-hierarchy-skip', '47813/a-propos').length > 0,
  'ruleId=heading-hierarchy-skip',
);

// 8. Artifact integrity: every visited declared page dir carries scan.json
let missingScanJson = 0;
for (const p of visitedDeclared) {
  if (p.pageDir && !existsSync(join(auditDir, p.pageDir, 'scan.json'))) missingScanJson += 1;
}
check(
  'every visited declared page dir has scan.json',
  missingScanJson === 0,
  `${missingScanJson} missing`,
);

console.log(
  `\nINFO  distinct findings: ${findings.length}; total occurrences: ${findings.reduce((a, f) => a + f.occurrences, 0)}`,
);
console.log(failures === 0 ? 'RESULT: ALL CHECKS PASS' : `RESULT: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
