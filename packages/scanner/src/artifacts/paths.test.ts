import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildArtifactBucketKey,
  buildAuditDir,
  buildAuditTimestampDir,
  buildPageDir,
  hashUrl,
  parseAuditTimestampDir,
  slugify,
} from './paths.js';

describe('buildAuditTimestampDir', () => {
  it('formats as ISO 8601 UTC with colons replaced by hyphens, no milliseconds', () => {
    const date = new Date('2026-08-02T14:32:05.123Z');
    expect(buildAuditTimestampDir(date)).toBe('2026-08-02T14-32-05Z');
  });

  it('sorts lexicographically the same as chronologically', () => {
    const earlier = buildAuditTimestampDir(new Date('2026-08-02T14:32:05.000Z'));
    const later = buildAuditTimestampDir(new Date('2026-08-02T14:32:06.000Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });
});

describe('slugify', () => {
  it('lowercases and collapses non-alphanumeric runs into single hyphens', () => {
    expect(slugify('/Services/Audit')).toBe('services-audit');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('/')).toBe('');
  });
});

describe('hashUrl', () => {
  it('is 6 hex characters and deterministic', () => {
    const hash = hashUrl('https://example.com/contact');
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
    expect(hashUrl('https://example.com/contact')).toBe(hash);
  });

  it('differs when the query string differs', () => {
    expect(hashUrl('https://example.com/?a=1')).not.toBe(hashUrl('https://example.com/?a=2'));
  });
});

describe('buildPageDir', () => {
  it('always appends the hash, avoiding a slug collision between distinct paths', () => {
    const a = buildPageDir('https://example.com/services/audit');
    const b = buildPageDir('https://example.com/services-audit');
    // Both slugify to "services-audit", but the hash (of the full,
    // unslugified URL) differs, so the directories differ too.
    expect(a).not.toBe(b);
    expect(a.startsWith('services-audit-')).toBe(true);
    expect(b.startsWith('services-audit-')).toBe(true);
  });

  it('falls back to "root" for the homepage path', () => {
    expect(buildPageDir('https://example.com/')).toMatch(/^root-[0-9a-f]{6}$/);
  });
});

describe('buildAuditDir', () => {
  it('joins artifactsRoot, hostname, and the timestamp dir', () => {
    const date = new Date('2026-08-02T14:32:05.000Z');
    const dir = buildAuditDir('/artifacts', 'example.com', date);
    expect(dir).toBe('/artifacts/example.com/2026-08-02T14-32-05Z');
  });

  it('keeps www.example.com and example.com as distinct hostnames', () => {
    const date = new Date('2026-08-02T14:32:05.000Z');
    const a = buildAuditDir('/artifacts', 'www.example.com', date);
    const b = buildAuditDir('/artifacts', 'example.com', date);
    expect(a).not.toBe(b);
  });
});

describe('parseAuditTimestampDir', () => {
  it('reverses buildAuditTimestampDir exactly', () => {
    const date = new Date('2026-08-02T14:32:05.000Z');
    expect(parseAuditTimestampDir(buildAuditTimestampDir(date))).toEqual(date);
  });

  it('rejects a string that is not this exact format', () => {
    expect(() => parseAuditTimestampDir('not-a-timestamp')).toThrow(
      /not a valid audit timestamp directory name/u,
    );
    expect(() => parseAuditTimestampDir('2026-08-02T14:32:05Z')).toThrow(
      /not a valid audit timestamp directory name/u,
    );
  });
});

describe('buildArtifactBucketKey', () => {
  it("mirrors buildAuditDir's hostname/timestamp shape, then the relative path", () => {
    const date = new Date('2026-08-02T14:32:05.000Z');
    const key = buildArtifactBucketKey('example.com', date, 'manifest.json');
    expect(key).toBe('example.com/2026-08-02T14-32-05Z/manifest.json');
  });

  it('always uses forward slashes for a nested relative path, even one built with path.sep', () => {
    const date = new Date('2026-08-02T14:32:05.000Z');
    const relative = ['pages', 'root-abc123', 'scan.json'].join(path.sep);
    const key = buildArtifactBucketKey('example.com', date, relative);
    expect(key).toBe('example.com/2026-08-02T14-32-05Z/pages/root-abc123/scan.json');
  });
});
