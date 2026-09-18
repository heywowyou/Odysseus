import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NORMALIZATION_FINGERPRINT, type AuditManifest } from '@odysseus/core';
import { auditDataVersionState, isOutreachQualifyingAudit } from '@odysseus/store';

/**
 * Plan 050 closure proof, runtime half (the static half is
 * derived-output-no-acquisition.test.ts): the scanner's website-acquisition
 * boundary is instrumented, and offline derived work runs for real over
 * stored evidence. Every scanner function outside the non-acquisition
 * helpers is replaced by a spy that records the call and throws, and
 * `fetch` is stubbed the same way.
 */

const acquisitionCalls = vi.hoisted(() => [] as string[]);
vi.mock('@odysseus/scanner', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const nonAcquisition = new Set([
    'buildAuditDir',
    'getArtifactsRoot',
    'buildArtifactBucketKey',
    'buildAuditArtifactBucketPrefix',
    'buildAuditTimestampDir',
    'parseAuditTimestampDir',
    'readOdysseusBuildId',
    'ensureEnvLoaded',
    'findWorkspaceRoot',
  ]);
  const wrapped: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value === 'function' && !nonAcquisition.has(name)) {
      wrapped[name] = (..._args: unknown[]) => {
        acquisitionCalls.push(name);
        throw new Error(`website acquisition ${name} called from derived work`);
      };
    }
  }
  return wrapped;
});

const { renormalizeAudit } = await import('./pipeline/renormalize-audit.js');
const { assembleOutreachDraft } = await import('./outreach/assemble-outreach-draft.js');

const FIXTURE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/test-audits/small-site/manifest.json',
);

const fetchSpy = vi.fn(() => Promise.reject(new Error('network called from derived work')));
let auditDir: string;

beforeEach(async () => {
  acquisitionCalls.length = 0;
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  auditDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-derived-'));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(auditDir, { recursive: true, force: true });
});

/** A stored audit whose findings were normalized by older code. */
async function writeStoredOlderAudit(): Promise<AuditManifest> {
  const manifest = JSON.parse(await fs.readFile(FIXTURE_MANIFEST, 'utf8')) as AuditManifest;
  const older: AuditManifest = {
    ...manifest,
    findingsProvenance: {
      ...manifest.findingsProvenance!,
      normalizationFingerprint: 'older-normalization',
    },
  };
  await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(older));
  const pageUrl = manifest.pages[0]!.url;
  await fs.mkdir(path.join(auditDir, 'pages', 'home'), { recursive: true });
  await fs.writeFile(
    path.join(auditDir, 'pages', 'home', 'scan.json'),
    JSON.stringify({
      url: pageUrl,
      axe: {
        violations: [
          {
            id: 'image-alt',
            impact: 'critical',
            tags: ['wcag2a', 'wcag111'],
            help: 'Images must have alternative text',
            description: 'Ensures <img> elements have alternative text',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.12/image-alt',
            nodes: [{ html: '<img src="a.jpg">', target: ['img'], impact: 'critical' }],
          },
        ],
      },
    }),
  );
  return older;
}

describe('derived work over stored evidence', () => {
  it('spies on the acquisition boundary, so the empty call lists below are not vacuous', async () => {
    const scanner = await import('@odysseus/scanner');
    await expect(async () =>
      scanner.crawlSite('https://example.com/', {} as never),
    ).rejects.toThrow(/acquisition/);
    expect(acquisitionCalls).toEqual(['crawlSite']);
  });

  it('renormalizes an older stored audit offline, without acquisition or network', async () => {
    const older = await writeStoredOlderAudit();

    const result = await renormalizeAudit(auditDir, undefined);

    expect(result.auditId).toBe(older.auditId);
    expect(result.findingCount).toBeGreaterThan(0);
    expect(result.manifest.findingsProvenance?.normalizationFingerprint).toBe(
      NORMALIZATION_FINGERPRINT,
    );
    expect(acquisitionCalls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps an older-version complete Full scan outreach-qualified, and writes its draft offline', async () => {
    const older = await writeStoredOlderAudit();
    const audit = {
      scanIntent: 'full-audit' as const,
      pages: older.pages.map((page) => ({
        status: page.status,
        ...(page.httpStatus === undefined ? {} : { httpStatus: page.httpStatus }),
      })),
      findingsProvenance: older.findingsProvenance!,
    };
    expect(auditDataVersionState(audit)).toBe('older');
    expect(isOutreachQualifyingAudit(audit)).toBe(true);

    const draft = assembleOutreachDraft({
      touch: 1,
      language: 'fr',
      hotelName: 'Hôtel des Tilleuls',
      variantSeed: 'candidate-1',
      scanSummary: {
        distinctFindingCount: 3,
        affectedPageCount: 1,
        severityTotals: { critical: 1, serious: 1, moderate: 1, minor: 0 },
        proofCardCategories: ['accessibility'],
      },
      previewUrl: 'https://www.odysseusaudit.com/apercu/abc123',
      dataOrigins: ['public-hotel-catalogue', 'public-website'],
      privacyUrl: 'https://www.odysseusaudit.com/confidentialite-prospection',
      optOutUrl: 'https://www.odysseusaudit.com/desinscription',
    });

    expect(draft.assembled).toBe(true);
    expect(acquisitionCalls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
