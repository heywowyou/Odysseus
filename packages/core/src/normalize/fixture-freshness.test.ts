/**
 * Fails when a stored audit the test suite reads as a fixture was derived by
 * older normalization code than the code now in the tree.
 *
 * This exists because of a concrete failure, not a hypothetical one. On
 * 2026-08-25 the whole suite was green while the sas-fernande fixture still
 * held 78 findings, months after the collapses that took it to 42. Tests
 * asserting "78 findings, 61 minor" were describing a pipeline that no longer
 * existed, and the first person to re-run `normalize` on that directory would
 * have been handed eight unexplained failures with no way to tell a real
 * regression from accumulated staleness.
 *
 * The fixtures themselves cannot simply be committed: they are 48 MB of
 * findings and manifests before screenshots, and the per-page scanner output
 * behind them is another 170 MB. So instead of versioning the data, this
 * versions the question "was it produced by this code", which is the only
 * property the tests actually depend on.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FINGERPRINT_FILENAME, REPO_ROOT, fixtureAudits, normalizeFingerprint } from '../../../../scripts/fixture-fingerprint.mjs';

interface FixtureAudit {
  dir: string;
  purpose: string;
}

describe('fixture freshness', () => {
  it('every fixture audit was normalized by the current code', () => {
    const expected = normalizeFingerprint();
    const audits = fixtureAudits() as FixtureAudit[];
    expect(audits.length).toBeGreaterThan(0);

    const stale: string[] = [];
    for (const audit of audits) {
      const dir = path.join(REPO_ROOT, audit.dir);
      // A fixture absent from this machine is a different problem, reported by
      // the tests that actually need it. Only staleness is judged here.
      if (!existsSync(path.join(dir, 'findings.json'))) continue;

      const stampPath = path.join(dir, FINGERPRINT_FILENAME);
      const stamp = existsSync(stampPath) ? readFileSync(stampPath, 'utf-8').trim() : '(never stamped)';
      if (stamp !== expected) stale.push(`${audit.dir} was normalized at ${stamp}, code is at ${expected}`);
    }

    expect(
      stale,
      `Stale fixtures. Run: pnpm fixtures:refresh\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('every fixture audit states why it is kept', () => {
    // Curation, not accumulation: this list grew to thirteen directories with
    // three timestamps for some sites and no record of what any of them was
    // for, which is how a stale one goes unnoticed.
    for (const audit of fixtureAudits() as FixtureAudit[]) {
      expect(audit.purpose.length, audit.dir).toBeGreaterThan(40);
    }
  });
});
