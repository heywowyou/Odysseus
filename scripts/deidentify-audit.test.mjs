/**
 * Issue #519: deidentify-audit.mjs decides what of a prospect's audit enters
 * git history, and had no test. This runs the real script on a synthetic
 * audit into a temporary directory and checks nothing that names the site
 * survives, visitor text is redacted, and no two pages merge.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/deidentify-audit.mjs');
// The script computes provenance through core's built module.
const built = existsSync(
  path.join(REPO_ROOT, 'packages/core/dist/normalize/findings-provenance.js'),
);

const work = mkdtempSync(path.join(tmpdir(), 'odysseus-deidentify-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const SITE = 'https://www.hotel-fernande.fr';
const source = path.join(work, 'source');
mkdirSync(path.join(source, 'analyses'), { recursive: true });
writeFileSync(
  path.join(source, 'manifest.json'),
  JSON.stringify({
    auditId: 'source-audit-id',
    siteUrl: `${SITE}/`,
    pages: [
      { url: `${SITE}/`, status: 'visited' },
      { url: `${SITE}/fernande/`, status: 'visited' },
      { url: `${SITE}/gaston/`, status: 'visited' },
    ],
  }),
);
writeFileSync(
  path.join(source, 'findings.json'),
  JSON.stringify([
    {
      auditId: 'source-audit-id',
      findingId: 'f001',
      title: 'Image without alt text',
      description: 'The Hotel Fernande logo has no text alternative.',
      pageUrls: [`${SITE}/fernande/`],
      elements: [
        {
          pageUrl: `${SITE}/fernande/`,
          selector: '.logo',
          snippet:
            '<img src="/fernande.png" alt="Hôtel Fernande, chez Gaston">Réservez chez Gaston',
        },
      ],
      rawEvidence: { perPage: { [`${SITE}/gaston/`]: { note: 'gaston' } } },
    },
  ]),
);
writeFileSync(
  path.join(source, 'analyses', '2026-09-25T00-00-00Z-fr.json'),
  JSON.stringify({ language: 'fr', executiveSummary: 'Le site de l’Hôtel Fernande…' }),
);

describe.skipIf(!built)('deidentify-audit.mjs (issue #519)', () => {
  const outRoot = path.join(work, 'out');
  execFileSync(
    'node',
    [
      SCRIPT,
      '--source',
      source,
      '--name',
      'sample',
      '--host',
      'sample-site.test',
      '--brand',
      'Sample Site',
      '--token',
      'Gaston',
      '--out-root',
      outRoot,
    ],
    { cwd: REPO_ROOT, stdio: 'pipe' },
  );
  const target = path.join(outRoot, 'sample');
  const written = [
    'manifest.json',
    'findings.json',
    ...readdirSync(path.join(target, 'analyses')).map((file) => `analyses/${file}`),
  ]
    .map((file) => readFileSync(path.join(target, file), 'utf8'))
    .join('\n')
    .toLowerCase();

  it('writes into the chosen root, never into fixtures/test-audits', () => {
    expect(existsSync(path.join(REPO_ROOT, 'fixtures/test-audits/sample'))).toBe(false);
    expect(existsSync(path.join(target, 'manifest.json'))).toBe(true);
  });

  it('leaves no spelling of the site or of a named person', () => {
    for (const token of ['fernande', 'hotel-fernande', 'gaston', 'source-audit-id']) {
      expect(written, token).not.toContain(token);
    }
  });

  it('redacts visitor text inside quoted markup', () => {
    const [finding] = JSON.parse(readFileSync(path.join(target, 'findings.json'), 'utf8'));
    expect(finding.elements[0].snippet).toBe('<img src="redacted" alt="redacted">redacted');
  });

  it('keeps every page distinct', () => {
    const manifest = JSON.parse(readFileSync(path.join(target, 'manifest.json'), 'utf8'));
    const urls = manifest.pages.map((page) => page.url);
    expect(new Set(urls).size).toBe(3);
  });
});
