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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FINGERPRINT_FILENAME,
  REPO_ROOT,
  fixtureAudits,
  normalizeFingerprint,
} from '../../../../scripts/fixture-fingerprint.mjs';
import { buildFindingsProvenance } from './findings-provenance.js';
import type { Finding } from '../types/findings.js';

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
      const stamp = existsSync(stampPath)
        ? readFileSync(stampPath, 'utf-8').trim()
        : '(never stamped)';
      if (stamp !== expected)
        stale.push(`${audit.dir} was normalized at ${stamp}, code is at ${expected}`);
    }

    expect(stale, `Stale fixtures. Run: pnpm fixtures:refresh\n${stale.join('\n')}`).toEqual([]);
  });

  it('every fixture audit states why it is kept', () => {
    // Curation, not accumulation: this list grew to thirteen directories with
    // three timestamps for some sites and no record of what any of them was
    // for, which is how a stale one goes unnoticed.
    for (const audit of fixtureAudits() as FixtureAudit[]) {
      expect(audit.purpose.length, audit.dir).toBeGreaterThan(40);
    }
  });

  it('every committed test-audit carries the current provenance stamp', async () => {
    // The committed, de-identified copies under fixtures/test-audits/ are a
    // separate derived artifact from the gitignored audits listed above, and
    // fixtures:refresh never touches them (trade-off 34). Three times a
    // fingerprint bump shipped without re-stamping them, and on any machine
    // with a live MONGODB_URI the report command then failed closed on the
    // provenance check (issue #75, recurrences under af8054d, 3b79441 and
    // 5095a29). This ratchet makes the re-stamp a required part of the
    // fingerprint-bump commit itself.
    //
    // What this proves: the stamps name the code now in the tree, and every
    // stamped document's digest is what the current code computes over the
    // committed findings.json. What it cannot prove: that findings.json is
    // what today's code would re-derive from the original raw scans, since
    // those scans are gitignored and may live on another machine. A
    // fingerprint bump that changes derivation output still needs a real
    // fixtures:refresh wherever the scans are; this test only guarantees the
    // bump cannot ship while the committed copies still carry the old stamp.
    const expected = normalizeFingerprint();
    const committed = ['small-site', 'multi-page', 'large-rule-families'];

    for (const name of committed) {
      const dir = path.join(REPO_ROOT, 'fixtures/test-audits', name);
      const findings = JSON.parse(
        readFileSync(path.join(dir, 'findings.json'), 'utf-8'),
      ) as Finding[];
      const { findingsDigest } = buildFindingsProvenance(findings);

      const stamped: Array<
        [
          string,
          { findingsProvenance?: { normalizationFingerprint: string; findingsDigest: string } },
        ]
      > = [['manifest.json', JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf-8'))]];
      for (const entry of readdirSync(path.join(dir, 'analyses'))) {
        stamped.push([
          `analyses/${entry}`,
          JSON.parse(readFileSync(path.join(dir, 'analyses', entry), 'utf-8')),
        ]);
      }

      for (const [file, doc] of stamped) {
        const provenance = doc.findingsProvenance;
        // Review-side documents record model verdicts, not findings-derived
        // state, and legitimately carry no stamp.
        if (!provenance) continue;
        expect(provenance.normalizationFingerprint, `${name}/${file}`).toBe(expected);
        expect(provenance.findingsDigest, `${name}/${file}`).toBe(findingsDigest);
      }
    }
  });
});
