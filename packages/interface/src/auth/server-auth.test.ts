import type { Connection } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refusesUnprotectedNonLoopbackBind, startInterfaceServer } from '../server.js';

describe('refusesUnprotectedNonLoopbackBind', () => {
  it.each(['127.0.0.1', '::1', 'localhost'])(
    'keeps the historical no-auth posture on loopback %s',
    (host) => {
      expect(refusesUnprotectedNonLoopbackBind(host, false)).toBe(false);
    },
  );

  it.each(['0.0.0.0', '::', '10.0.0.5', 'app.odysseusaudit.com'])(
    'refuses the public bind %s without auth',
    (host) => {
      expect(refusesUnprotectedNonLoopbackBind(host, false)).toBe(true);
    },
  );

  it('allows any host once a password hash is configured', () => {
    expect(refusesUnprotectedNonLoopbackBind('0.0.0.0', true)).toBe(false);
    expect(refusesUnprotectedNonLoopbackBind('app.odysseusaudit.com', true)).toBe(false);
  });

  it('tolerates casing and stray whitespace on loopback hosts', () => {
    expect(refusesUnprotectedNonLoopbackBind(' LocalHost ', false)).toBe(false);
  });
});

describe('startInterfaceServer refuse-to-start', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws before listening when unauthenticated on a non-loopback host', async () => {
    vi.stubEnv('ODYSSEUS_INTERFACE_HOST', '0.0.0.0');
    const connection = {} as Connection;
    await expect(startInterfaceServer(connection, { getPasswordHash: () => null })).rejects.toThrow(
      /ODYSSEUS_DASHBOARD_PASSWORD_HASH/,
    );
  });
});
