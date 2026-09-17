import { describe, expect, it } from 'vitest';
import { parseRobotsTxt } from './robots.js';
import {
  buildRobotsPolicySnapshot,
  describeRobotsPolicyTransition,
  effectiveCrawlDelayMs,
  epochSitemapUrls,
  isPathAllowedForEpoch,
  shouldRevalidateRobots,
  type RobotsPolicySnapshot,
} from './robots-policy-snapshot.js';

const USER_AGENT = 'OdysseusAudit/1.0 (+https://odysseusaudit.com/bot)';

function snapshotOf(
  robotsText: string | null,
  overrides: { revision?: number; retrievedAt?: Date; configuredDelayMs?: number } = {},
): RobotsPolicySnapshot {
  return buildRobotsPolicySnapshot({
    evidenceEpoch: 1,
    revision: overrides.revision ?? 0,
    origin: 'https://hotel-exemple.fr',
    userAgent: USER_AGENT,
    robotsText,
    retrievedAt: overrides.retrievedAt ?? new Date('2026-09-18T08:00:00.000Z'),
    rules:
      robotsText === null
        ? { found: false, disallow: [], allow: [], sitemapUrls: [] }
        : parseRobotsTxt(robotsText, USER_AGENT),
    configuredDelayMs: overrides.configuredDelayMs ?? 1000,
  });
}

describe('snapshot identity', () => {
  it('records the exact bytes and digests them', () => {
    const snapshot = snapshotOf('User-agent: *\nDisallow: /admin\n');
    expect(snapshot.robotsText).toBe('User-agent: *\nDisallow: /admin\n');
    expect(snapshot.robotsTextDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(snapshot.productToken).toBe('odysseusaudit');
  });

  it('digests an unreachable robots.txt differently from an empty one', () => {
    expect(snapshotOf(null).robotsTextDigest).toBe(snapshotOf('').robotsTextDigest);
    // The bytes are the same, but the parsed rules are not, so the snapshot
    // digests differ even though the text digests agree.
    expect(snapshotOf(null).digest).not.toBe(snapshotOf('').digest);
  });

  it('raises the requested delay to a crawl-delay directive but never lowers it', () => {
    const slow = snapshotOf('User-agent: *\nCrawl-delay: 5\n', { configuredDelayMs: 1000 });
    expect(slow.requestedDelayMs).toBe(5000);

    const fast = snapshotOf('User-agent: *\nCrawl-delay: 0.2\n', { configuredDelayMs: 1000 });
    expect(fast.requestedDelayMs).toBe(1000);
  });
});

describe('the epoch policy chain', () => {
  it('refuses a path as soon as any revalidation disallows it', () => {
    const permissive = snapshotOf('User-agent: *\nDisallow:\n');
    const tightened = snapshotOf('User-agent: *\nDisallow: /chambres\n', { revision: 1 });

    expect(isPathAllowedForEpoch([permissive], '/chambres')).toBe(true);
    expect(isPathAllowedForEpoch([permissive, tightened], '/chambres')).toBe(false);
    expect(isPathAllowedForEpoch([permissive, tightened], '/tarifs')).toBe(true);
  });

  it('does not widen scope when a later file loosens, keeping one epoch explainable', () => {
    const strict = snapshotOf('User-agent: *\nDisallow: /chambres\n');
    const loosened = snapshotOf('User-agent: *\nDisallow:\n', { revision: 1 });

    expect(isPathAllowedForEpoch([strict, loosened], '/chambres')).toBe(false);
  });

  it('takes the largest delay any snapshot asked for', () => {
    const first = snapshotOf('User-agent: *\nCrawl-delay: 2\n');
    const slower = snapshotOf('User-agent: *\nCrawl-delay: 9\n', { revision: 1 });
    const fastAgain = snapshotOf('User-agent: *\nCrawl-delay: 1\n', { revision: 2 });

    expect(effectiveCrawlDelayMs([first, slower, fastAgain])).toBe(9000);
  });

  it('collects sitemap directives added by a later revalidation', () => {
    const first = snapshotOf('User-agent: *\nSitemap: https://hotel-exemple.fr/sitemap.xml\n');
    const second = snapshotOf(
      'User-agent: *\nSitemap: https://hotel-exemple.fr/sitemap.xml\nSitemap: https://hotel-exemple.fr/sitemap-en.xml\n',
      { revision: 1 },
    );

    expect(epochSitemapUrls([first, second])).toEqual([
      'https://hotel-exemple.fr/sitemap.xml',
      'https://hotel-exemple.fr/sitemap-en.xml',
    ]);
  });
});

describe('revalidation timing', () => {
  const chain = [snapshotOf('User-agent: *\n', { retrievedAt: new Date('2026-09-18T08:00:00Z') })];

  it('is due when the epoch has no snapshot yet', () => {
    expect(shouldRevalidateRobots([], new Date(), { intervalMs: 3_600_000 })).toEqual({
      due: true,
      reason: 'no-snapshot',
    });
  });

  it('is not due inside the interval', () => {
    expect(
      shouldRevalidateRobots(chain, new Date('2026-09-18T08:30:00Z'), {
        intervalMs: 3_600_000,
      }),
    ).toEqual({ due: false, reason: 'not-due' });
  });

  it('is due once the interval has elapsed on a long run', () => {
    expect(
      shouldRevalidateRobots(chain, new Date('2026-09-18T12:00:00Z'), {
        intervalMs: 3_600_000,
      }),
    ).toEqual({ due: true, reason: 'interval-elapsed' });
  });

  it('is due at a phase boundary regardless of elapsed time', () => {
    expect(
      shouldRevalidateRobots(chain, new Date('2026-09-18T08:00:05Z'), {
        intervalMs: 3_600_000,
        atPhaseBoundary: true,
      }),
    ).toEqual({ due: true, reason: 'phase-boundary' });
  });
});

describe('describing what a revalidation changed', () => {
  it('names the paths the epoch may no longer request', () => {
    const chain = [snapshotOf('User-agent: *\nDisallow:\n')];
    const tightened = snapshotOf('User-agent: *\nDisallow: /chambres\n', { revision: 1 });

    const transition = describeRobotsPolicyTransition(chain, tightened, ['/chambres', '/tarifs']);

    expect(transition.changed).toBe(true);
    expect(transition.newlyDisallowed).toEqual(['/chambres']);
    expect(transition.stillRefusedDespiteLoosening).toEqual([]);
  });

  it('records a loosening the epoch deliberately does not act on', () => {
    const chain = [snapshotOf('User-agent: *\nDisallow: /chambres\n')];
    const loosened = snapshotOf('User-agent: *\nDisallow:\n', { revision: 1 });

    const transition = describeRobotsPolicyTransition(chain, loosened, ['/chambres']);

    expect(transition.newlyDisallowed).toEqual([]);
    expect(transition.stillRefusedDespiteLoosening).toEqual(['/chambres']);
  });

  it('reports an unchanged file as unchanged', () => {
    const text = 'User-agent: *\nDisallow: /admin\n';
    const transition = describeRobotsPolicyTransition(
      [snapshotOf(text)],
      snapshotOf(text, { revision: 1, retrievedAt: new Date('2026-09-18T12:00:00Z') }),
      ['/admin', '/tarifs'],
    );

    expect(transition.changed).toBe(false);
    expect(transition.newlyDisallowed).toEqual([]);
  });

  it('surfaces a delay increase so the scheduler can be slowed', () => {
    const transition = describeRobotsPolicyTransition(
      [snapshotOf('User-agent: *\nCrawl-delay: 2\n')],
      snapshotOf('User-agent: *\nCrawl-delay: 8\n', { revision: 1 }),
      [],
    );

    expect(transition.delayIncreasedToMs).toBe(8000);
  });
});
