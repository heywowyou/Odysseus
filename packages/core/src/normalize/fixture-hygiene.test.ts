/**
 * Fails when the committed de-identified audit tree has picked up files nobody
 * committed on purpose.
 *
 * This exists because of a concrete incident, not a hypothetical one. On
 * 2026-09-02 four timestamped analysis JSONs appeared under
 * fixtures/test-audits/large-rule-families/analyses/ during a working session
 * (a structure, review and French analysis at 15:24:29Z, an English one at
 * 15:25:12Z). They were not written by the test suite: the same directory's
 * gitignored reports/ folder holds French and English PDFs rendered at
 * 15:25:56Z and 15:25:59Z, so what actually ran was an ordinary analyze-then-
 * report pipeline pointed at the fixture directory, whose analyses land in a
 * tracked folder while its PDFs land in an ignored one. Being untracked, they
 * showed up as noise in every later `git status` with nothing to say whether
 * they were a deliberate rebake (the 2026-09-01 batch beside them was exactly
 * that) or an accident.
 *
 * The harm is not the noise. Both loaders that read this fixture resolve an
 * analysis by suffix and take the newest filename - report's
 * `latestAnalysisPath` and llm's `loadLargeRuleFamiliesRawThemes` both do
 * `.sort().at(-1)`, deliberately, so a regenerated fixture does not need a
 * pinned filename edited into the test. A stray analysis sorts after the
 * committed ones and silently becomes the fixture under test, on one machine
 * only. That is the same failure trade-off 34 forbids when it says never to
 * gitignore these directories: a green suite describing data no other machine
 * has. Making the stray file a red test is what keeps "the fixture" and "the
 * committed fixture" the same thing.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../../../scripts/fixture-fingerprint.mjs';

const COMMITTED_FIXTURE_TREE = 'fixtures/test-audits';

/** Untracked paths under the committed fixture tree, or undefined when this
 *  is not a git checkout at all (a tarball, a vendored copy). Absence of git
 *  is a different situation from a dirty tree and must not fail the build. */
function untrackedFixtureFiles(): string[] | undefined {
  let stdout: string;
  try {
    stdout = execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=all', '--', COMMITTED_FIXTURE_TREE],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return undefined;
  }
  return stdout
    .split('\n')
    .filter((line) => line.startsWith('??'))
    .map((line) => line.slice(3).trim());
}

describe('committed fixture hygiene', () => {
  it('the committed audit tree has no untracked files', () => {
    const untracked = untrackedFixtureFiles();
    if (untracked === undefined) return;

    expect(
      untracked,
      `Untracked files under ${COMMITTED_FIXTURE_TREE}. A pipeline run pointed at a ` +
        `fixture directory writes its analyses into the tracked tree, and the newest ` +
        `one silently becomes what the tests read. Commit them if this was a ` +
        `deliberate rebake, delete them otherwise:\n${untracked.join('\n')}`,
    ).toEqual([]);
  });
});
