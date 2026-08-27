/**
 * Builds a committed test fixture from a stored audit, with the site it came
 * from removed.
 *
 * The tests need a real scan's shape: genuine rule ids, genuine occurrence
 * counts, a real severity spread, real page fan-out. What they do not need,
 * and what must never enter git history, is which site those defects belong
 * to. A prospect's audit results are theirs, and a commit cannot be withdrawn.
 *
 *   node scripts/deidentify-audit.mjs \
 *     --source artifacts/<host>/<timestamp> \
 *     --name small-site --host small-site.test --brand "Small Site" \
 *     [--token Fernande]
 *
 * The source-to-fixture mapping is deliberately not recorded anywhere. Writing
 * it into a committed file would rebuild the link this script exists to break,
 * so regenerating a fixture requires an operator who still has the artifacts
 * and knows which one it was. That is the intended cost.
 *
 * Only manifest.json, findings.json and analyses/ are read. pages/scan.json is
 * never copied: it carries base64 screenshots of the site, and the surest way
 * not to commit them is never to handle them.
 *
 * The last step is the one that actually guarantees anything: every written
 * byte is read back and searched for every token, and the script fails rather
 * than leaving a fixture that still names someone. Redaction you do not verify
 * is redaction you are guessing at.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = { tokens: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    if (flag === '--token') options.tokens.push(value);
    else if (flag.startsWith('--')) options[flag.slice(2)] = value;
    else throw new Error(`Unexpected argument ${flag}`);
  }
  for (const required of ['source', 'name', 'host', 'brand']) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  return options;
}

/** Every spelling of the source identity that could survive a naive replace:
 *  the host with and without www, the registrable domain, the bare label, and
 *  the label's own words (a hyphenated domain is usually the business name). */
function identityTokens(sourceHost, extra) {
  const bare = sourceHost.replace(/^www\./u, '');
  const label = bare.split('.')[0] ?? bare;
  const words = label.split(/[-_]/u).filter((word) => word.length >= 4);
  // Longest first: replacing "fernande" before "sas-fernande.fr" would leave a
  // half-rewritten host behind.
  return [...new Set([sourceHost, bare, label, ...words, ...extra])].sort(
    (a, b) => b.length - a.length,
  );
}

/** Text a visitor would read, and the attributes that carry it. Tag names,
 *  ids and classes are left alone: they are how a finding stays legible as a
 *  real defect, and a theme class name identifies the theme, not the client. */
function redactMarkup(value) {
  return value
    .replace(/>([^<]+)</gu, (match, text) => (text.trim() === '' ? match : '>redacted<'))
    .replace(
      /\b(href|src|srcset|alt|title|aria-label|placeholder|value|content)="[^"]*"/giu,
      '$1="redacted"',
    );
}

/** One replacement per token, never one replacement for all of them.
 *
 *  Collapsing every token onto a single brand turned `/fernande/` and
 *  `/gaston/` into the same `/small-site/`, silently merging two distinct
 *  pages. A fixture that has lost a page is no longer the scan it claims to
 *  reproduce, so each token gets its own stable pseudonym and the mapping
 *  stays injective. The first token is the business's own name and keeps the
 *  readable brand; the rest are numbered.
 *
 *  A URL path needs the slug spelling and prose needs the readable one, so
 *  each pseudonym has both forms. Using the brand everywhere produced paths
 *  like `/Small Site/`, which is both wrong and a tell that something was
 *  rewritten. */
function buildReplacements(tokens, options) {
  const slug = options.host.split('.')[0];
  const replacements = new Map();
  let ordinal = 0;
  for (const token of tokens) {
    if (token.includes('.')) {
      replacements.set(token, { prose: options.host, url: options.host });
      continue;
    }
    ordinal += 1;
    replacements.set(
      token,
      ordinal === 1
        ? { prose: options.brand, url: slug }
        : { prose: `${options.brand} ${ordinal}`, url: `${slug}-${ordinal}` },
    );
  }
  return replacements;
}

function rewriteString(value, replacements) {
  const urlLike = value.startsWith('http') || value.includes('/');
  let next = value;
  for (const [token, replacement] of replacements) {
    const pattern = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu');
    next = next.replaceAll(pattern, urlLike ? replacement.url : replacement.prose);
  }
  if (/<[a-z][^>]*>/iu.test(next)) next = redactMarkup(next);
  return next;
}

function rewrite(node, replacements) {
  if (typeof node === 'string') return rewriteString(node, replacements);
  if (Array.isArray(node)) return node.map((item) => rewrite(item, replacements));
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      // Keys carry URLs too: rawEvidence buckets per-page results by URL.
      out[rewriteString(key, replacements)] = rewrite(value, replacements);
    }
    return out;
  }
  return node;
}

/** Stable across regenerations, so a fixture rebuild is not a diff of every
 *  auditId. Derived from the fixture name, never from the source. */
function fixtureAuditId(name) {
  const hex = createHash('sha256').update(`odysseus-fixture:${name}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

const options = parseArgs(process.argv.slice(2));
const sourceDir = path.resolve(REPO_ROOT, options.source);
const targetDir = path.join(REPO_ROOT, 'fixtures/test-audits', options.name);

const manifest = JSON.parse(readFileSync(path.join(sourceDir, 'manifest.json'), 'utf-8'));
const findings = JSON.parse(readFileSync(path.join(sourceDir, 'findings.json'), 'utf-8'));
const sourceHost = new URL(manifest.siteUrl).hostname;
const tokens = identityTokens(sourceHost, options.tokens);
const replacements = buildReplacements(tokens, options);
const auditId = fixtureAuditId(options.name);

function finalize(value) {
  const rewritten = rewrite(value, replacements);
  return JSON.parse(JSON.stringify(rewritten).replaceAll(manifest.auditId, auditId));
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
writeFileSync(
  path.join(targetDir, 'manifest.json'),
  `${JSON.stringify(finalize(manifest), null, 2)}\n`,
);
writeFileSync(
  path.join(targetDir, 'findings.json'),
  `${JSON.stringify(finalize(findings), null, 2)}\n`,
);

const sourceAnalyses = path.join(sourceDir, 'analyses');
let analysisCount = 0;
if (existsSync(sourceAnalyses)) {
  mkdirSync(path.join(targetDir, 'analyses'), { recursive: true });
  for (const file of readdirSync(sourceAnalyses).sort()) {
    if (!file.endsWith('.json')) continue;
    const analysis = finalize(JSON.parse(readFileSync(path.join(sourceAnalyses, file), 'utf-8')));
    // The artifacts layout, because report-env-loading.e2e.test.ts copies this
    // fixture and runs the real CLI against it, and the CLI resolves an
    // analysis by that name.
    const stamp = String(analysis.generatedAt).replace(/[:.]/gu, '-');
    writeFileSync(
      path.join(targetDir, 'analyses', `${stamp}-${analysis.language}.json`),
      `${JSON.stringify(analysis, null, 2)}\n`,
    );
    analysisCount += 1;
  }
}

// A page lost to a collision is invisible in a leak check but fatal to the
// fixture's meaning, so assert the rewrite kept every page distinct.
const collisions = [];
const seen = new Map();
for (const [index, page] of finalize(manifest).pages.entries()) {
  const original = manifest.pages[index].url;
  const existing = seen.get(page.url);
  if (existing !== undefined && existing !== original) {
    collisions.push(`${existing} and ${original} both became ${page.url}`);
  }
  seen.set(page.url, original);
}

const leaks = [];
for (const file of [
  'manifest.json',
  'findings.json',
  ...(existsSync(path.join(targetDir, 'analyses'))
    ? readdirSync(path.join(targetDir, 'analyses')).map((name) => `analyses/${name}`)
    : []),
]) {
  const text = readFileSync(path.join(targetDir, file), 'utf-8').toLowerCase();
  for (const token of tokens) {
    if (text.includes(token.toLowerCase())) leaks.push(`${file}: "${token}"`);
  }
}

console.log(
  `${options.name}: ${findings.length} findings, ${manifest.pages.length} pages, ` +
    `${analysisCount} analyses -> fixtures/test-audits/${options.name}`,
);

// Token matching cannot know that a slug like /gaston/ is a person. It removes
// every spelling of the identity it was told about and nothing else, so the
// remaining path vocabulary is printed for a human to read. Anything here that
// names someone is a --token for the next run. Saying this out loud beats a
// script that quietly implies the job is finished.
const segments = new Set();
for (const page of finalize(manifest).pages) {
  for (const segment of new URL(page.url).pathname.split('/')) {
    if (segment !== '') segments.add(segment);
  }
}
console.log(`  path vocabulary to review: ${[...segments].sort().join(', ') || '(none)'}`);
if (collisions.length > 0) {
  console.error(`\nRewriting merged distinct pages:\n  ${collisions.join('\n  ')}`);
  process.exit(1);
}
if (leaks.length > 0) {
  console.error(
    `\nIdentity survived redaction, refusing to leave the fixture:\n  ${leaks.join('\n  ')}`,
  );
  process.exit(1);
}
