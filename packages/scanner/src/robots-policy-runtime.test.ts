import { describe, expect, it, vi } from 'vitest';
import { HostRequestScheduler } from './host-request-scheduler.js';
import { buildRobotsPolicySnapshot } from './robots-policy-snapshot.js';
import { RobotsPolicyRuntime, RobotsPolicyTightenedError } from './robots-policy-runtime.js';

describe('RobotsPolicyRuntime', () => {
  it('applies a stricter phase-boundary policy before further page work', async () => {
    const initial = buildRobotsPolicySnapshot({
      evidenceEpoch: 1,
      revision: 0,
      origin: 'https://example.com',
      userAgent: 'OdysseusBot/1.0',
      robotsText: 'User-agent: *\nAllow: /',
      retrievedAt: new Date('2026-09-18T00:00:00.000Z'),
      rules: { found: true, disallow: [], allow: ['/'], sitemapUrls: [] },
      configuredDelayMs: 333,
    });
    const scheduler = new HostRequestScheduler({
      floorDelayMs: 333,
      maxConcurrency: 1,
      now: () => 0,
      sleep: async () => {},
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('User-agent: *\nDisallow: /private', {
          status: 200,
        }),
      ),
    );

    const runtime = new RobotsPolicyRuntime({
      evidenceEpoch: 1,
      origin: 'https://example.com',
      userAgent: 'OdysseusBot/1.0',
      configuredDelayMs: 333,
      timeoutMs: 1000,
      scheduler,
      initialChain: [initial],
    });

    await expect(
      runtime.refresh(['https://example.com/private'], { phaseBoundary: true }),
    ).rejects.toBeInstanceOf(RobotsPolicyTightenedError);
    expect(runtime.chain).toHaveLength(2);
    expect(() => runtime.assertAllowed('https://example.com/private')).toThrow(
      RobotsPolicyTightenedError,
    );
  });
});
