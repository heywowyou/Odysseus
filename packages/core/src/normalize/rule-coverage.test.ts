/**
 * How many of the rules this tool can emit are exercised by any stored
 * fixture at all.
 *
 * Read this as a *recall* measurement, and only that. It says nothing about
 * whether the findings a report does contain are correct, which is a separate
 * property and the one that actually governs whether the report is sellable.
 * The two are worth keeping apart explicitly, because conflating them is easy
 * and expensive:
 *
 *   Recall     - does the scanner detect an issue that is really there.
 *                Bounded by what automated detection can reach at all, which
 *                docs/rules/manual-accessibility-checklist.md puts at roughly 30 to
 *                40 percent of WCAG criteria. No amount of fixture work moves
 *                that ceiling, and the report says so in its own methodology.
 *
 *   Precision  - is every finding the report prints a real, correctly
 *                described, singly-counted issue. This is the one held to a
 *                near-perfect standard, because a duplicate or a wrong number
 *                costs the report its credibility with a client who can check
 *                it. It is guarded elsewhere: the collapse invariants
 *                (occurrences preserved across a regrouping), the arithmetic
 *                checks in statistics.test.ts, the invented-id, page-count and
 *                legal-consequence guards in packages/llm, and the
 *                single-rule concentration check below.
 *
 * What this file contributes to precision is narrow but real: a rule with no
 * fixture behind it has never been observed firing, so nothing distinguishes
 * "correctly silent on every site scanned so far" from "cannot fire at all".
 * That is not hypothetical. Three rules shipped fully dressed with a severity
 * mapping, remediation copy and report wiring, and no emitter at all:
 * `hreflang-missing` (CLAUDE.md trade-off 31), the LCEN regime (trade-off 28),
 * and both cost gates (trade-off 23). Each was found by reading, months late.
 *
 * A ratchet, not a target. It fails when coverage drops, so adding a rule with
 * nothing exercising it is a deliberate, visible act. Raise the floor when
 * coverage improves; never lower it to make a red build green.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Finding } from '../types/findings.js';
import { CUSTOM_CHECK_SEVERITY } from './severity.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const testAuditsRoot = path.join(repoRoot, 'fixtures/test-audits');
const committedTestAudits = ['small-site', 'multi-page', 'large-rule-families'] as const;

/** Measured 2026-08-27 across the curated fixture set: 85 of 172 emittable
 *  rules, 49 percent. Every uncovered rule is one no fixture has ever tripped,
 *  so nothing in the suite would notice if it stopped working, or had never
 *  worked. Raising this is the useful work; the list the failure message
 *  prints is the to-do list for it.
 *
 *  The previous figure was 87 of 196, and 87 is not comparable to 85: the
 *  denominator changed under it. A Lighthouse upgrade renamed two dozen audits
 *  into an `*-insight` family, `generate-reachable-rule-ids.mjs` was re-run, and
 *  the old names left the emittable set. Eleven of them were rules the curated
 *  fixtures covered *only* under their pre-upgrade names, so the count fell
 *  while nothing stopped working - verified by intersecting the removed names
 *  against the observed set, which accounted for all eleven exactly.
 *
 *  That is a re-measurement, not the forbidden lowering, and it was paid for
 *  rather than simply written down: two fixtures were curated in first
 *  (`www.airelles.com` for the privacy checks firing positively, and the only
 *  post-upgrade haaitza scan for the renamed audits), taking the count from 76
 *  back to 85 and the fraction from 44 percent to 49. The remaining candidates
 *  each added a single rule as a fourth timestamp of an already-listed site,
 *  which is the accumulation fixtures/audits.json exists to prevent. */
const COVERAGE_FLOOR = 85;

/** No single rule may account for more than this share of one audit's
 *  findings.
 *
 *  Not a law, a smell, and it has now caught the same defect three times: 219
 *  of 282 findings in five rules on Domaine Lagnonu (trade-off 31's follow-up),
 *  102 of 305 in two Lighthouse image audits (trade-off 30), and 182 of 265
 *  language variants of one page (trade-off 24). Each time the cause was the
 *  same: the wrong identity chosen for a defect, so one instruction printed
 *  dozens of times.
 *
 *  A rule legitimately over this line exists - writing alt text is a separate
 *  editorial decision per image, so `image-alt` can honestly dominate a
 *  picture-heavy site. The threshold is set above the highest such measured
 *  case so that crossing it means something new happened, not that a known
 *  case drifted. */
const MAX_SINGLE_RULE_SHARE = 0.3;

interface StoredAudit {
  dir: string;
  findings: Finding[];
}

/** The committed de-identified audits retain per-audit shape, which is what the
 *  concentration check needs. A clean checkout must exercise the same inputs
 *  as an operator machine. */
function storedAudits(): StoredAudit[] {
  return committedTestAudits.map((auditName) => {
    const dir = path.join('fixtures/test-audits', auditName);
    const file = path.join(repoRoot, dir, 'findings.json');
    return { dir, findings: JSON.parse(readFileSync(file, 'utf-8')) as Finding[] };
  });
}

/** Aggregate rule IDs from the larger curated local audit set without
 *  committing any site-to-defect relationship. Rebuilt by `pnpm
 *  fixtures:rules`. */
function observedRuleIds(): Set<string> {
  const values = JSON.parse(
    readFileSync(path.join(testAuditsRoot, 'observed-rule-ids.json'), 'utf-8'),
  ) as string[];
  return new Set(values);
}

function emittableRuleIds(): Set<string> {
  const reachable = JSON.parse(
    readFileSync(
      path.join(repoRoot, 'packages/report/src/template/reachable-rule-ids.json'),
      'utf-8',
    ),
  ) as { axe: string[]; lighthouse: string[] };
  return new Set([
    ...reachable.axe,
    ...reachable.lighthouse,
    ...Object.keys(CUSTOM_CHECK_SEVERITY),
  ]);
}

describe('rule coverage across all stored fixtures (recall)', () => {
  it('does not fall below the measured floor', () => {
    const observed = observedRuleIds();
    const emittable = emittableRuleIds();
    const covered = [...emittable].filter((ruleId) => observed.has(ruleId));

    expect(
      covered.length,
      `Rule coverage fell to ${covered.length} of ${emittable.size}. Either a fixture was ` +
        'removed, or a rule was added with nothing exercising it. Uncovered rules:\n' +
        [...emittable]
          .filter((ruleId) => !observed.has(ruleId))
          .sort()
          .join(', '),
    ).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });
});

describe('single-rule concentration in a stored audit (precision smell)', () => {
  it('no rule dominates one audit past the threshold that has meant a duplication bug every time', () => {
    const offenders: string[] = [];
    for (const audit of storedAudits()) {
      if (audit.findings.length < 20) continue; // too small for a share to mean anything
      const byRule = new Map<string, number>();
      for (const finding of audit.findings) {
        byRule.set(finding.ruleId, (byRule.get(finding.ruleId) ?? 0) + 1);
      }
      for (const [ruleId, count] of byRule) {
        const share = count / audit.findings.length;
        if (share > MAX_SINGLE_RULE_SHARE) {
          offenders.push(
            `${audit.dir}: ${ruleId} is ${count} of ${audit.findings.length} findings (${Math.round(share * 100)}%)`,
          );
        }
      }
    }

    expect(
      offenders,
      'One rule dominates an audit. Check whether those findings are genuinely ' +
        'separate decisions or one instruction printed many times, and if the ' +
        'latter, give the rule a better identity (normalize-axe.ts shapeIdentity, ' +
        'normalize-lighthouse.ts RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS).\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
