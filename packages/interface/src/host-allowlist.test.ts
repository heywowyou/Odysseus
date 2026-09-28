import { describe, expect, it } from 'vitest';
import { isAllowedDashboardHost } from './host-allowlist.js';

describe('isAllowedDashboardHost (issue #546)', () => {
  it('accepts loopback hosts on any port', () => {
    for (const host of [
      '127.0.0.1:4600',
      'localhost:4600',
      'localhost',
      '[::1]:4600',
      'LOCALHOST',
    ]) {
      expect(isAllowedDashboardHost(host, [])).toBe(true);
    }
  });

  it('refuses a foreign host even when its Origin would match', () => {
    expect(isAllowedDashboardHost('rebind.attacker.example:4600', [])).toBe(false);
    expect(isAllowedDashboardHost('127.0.0.1.attacker.example', [])).toBe(false);
  });

  it('accepts the configured public host and nothing near it', () => {
    const publicHosts = ['app.odysseusaudit.com'];
    expect(isAllowedDashboardHost('app.odysseusaudit.com', publicHosts)).toBe(true);
    expect(isAllowedDashboardHost('APP.odysseusaudit.com:443', publicHosts)).toBe(true);
    expect(isAllowedDashboardHost('evil.odysseusaudit.com', publicHosts)).toBe(false);
  });

  it('refuses a missing or malformed Host header', () => {
    expect(isAllowedDashboardHost(undefined, [])).toBe(false);
    expect(isAllowedDashboardHost('', [])).toBe(false);
    expect(isAllowedDashboardHost('a b', [])).toBe(false);
  });
});
