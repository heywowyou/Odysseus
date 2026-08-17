import { describe, expect, it } from 'vitest';
import { isSocialPlatformHost } from './social-hosts.js';

describe('isSocialPlatformHost', () => {
  it('matches the bare domain and subdomains for every listed platform', () => {
    expect(isSocialPlatformHost('facebook.com')).toBe(true);
    expect(isSocialPlatformHost('www.facebook.com')).toBe(true);
    expect(isSocialPlatformHost('m.facebook.com')).toBe(true);
    expect(isSocialPlatformHost('instagram.com')).toBe(true);
    expect(isSocialPlatformHost('twitter.com')).toBe(true);
    expect(isSocialPlatformHost('x.com')).toBe(true);
    expect(isSocialPlatformHost('linkedin.com')).toBe(true);
    expect(isSocialPlatformHost('youtube.com')).toBe(true);
    expect(isSocialPlatformHost('tiktok.com')).toBe(true);
    expect(isSocialPlatformHost('pinterest.fr')).toBe(true);
    expect(isSocialPlatformHost('wa.me')).toBe(true);
    expect(isSocialPlatformHost('whatsapp.com')).toBe(true);
  });

  it('does not match an unrelated host, including one that merely contains a platform name', () => {
    expect(isSocialPlatformHost('example.com')).toBe(false);
    expect(isSocialPlatformHost('notfacebook.com')).toBe(false);
    expect(isSocialPlatformHost('facebook.com.evil.example')).toBe(false);
  });
});
