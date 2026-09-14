#!/usr/bin/env python3
"""Issue #261: proves each custom rule's fixtures behave as claimed.

Every rule under .semgrep/rules/<id>.yml has a fixtures directory at
.semgrep/fixtures/<id>/ holding bad.ts (must trigger the rule) and/or
good.ts (must not) plus a one-line stage-path file naming the directory,
relative to the repo root, the rule's own `paths.include` is scoped to.
Fixtures are staged into a throwaway copy of the repo at that exact
relative path before scanning - not scanned in place under .semgrep/ -
because a narrowly-scoped rule's paths.include would otherwise never
match them, and staging at the real path is what proves the rule fires
(or does not) exactly where production code lives.

Usage: python3 .semgrep/test-rules.py [semgrep-image]
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RULES_DIR = REPO_ROOT / '.semgrep' / 'rules'
FIXTURES_DIR = REPO_ROOT / '.semgrep' / 'fixtures'
SEMGREP_IMAGE = sys.argv[1] if len(sys.argv) > 1 else 'semgrep/semgrep:1.145.0'


def run_semgrep(config_path: Path, target_dir: Path) -> list[dict]:
    result = subprocess.run(
        [
            'docker', 'run', '--rm',
            '-v', f'{config_path}:/rule.yml:ro',
            '-v', f'{target_dir}:/target:ro',
            SEMGREP_IMAGE,
            'semgrep', 'scan', '--config', '/rule.yml', '/target',
            '--json', '--quiet', '--no-git-ignore',
        ],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)['results']


def main() -> int:
    failures: list[str] = []
    rule_ids = sorted(p.stem for p in RULES_DIR.glob('*.yml'))
    if not rule_ids:
        print('no rules found under .semgrep/rules/', file=sys.stderr)
        return 1

    for rule_id in rule_ids:
        rule_path = RULES_DIR / f'{rule_id}.yml'
        fixture_dir = FIXTURES_DIR / rule_id
        stage_path_file = fixture_dir / 'stage-path'
        if not stage_path_file.exists():
            failures.append(f'{rule_id}: missing fixtures/{rule_id}/stage-path')
            continue
        stage_prefix = stage_path_file.read_text().strip()

        with tempfile.TemporaryDirectory() as tmp:
            staged = Path(tmp) / stage_prefix
            staged.mkdir(parents=True, exist_ok=True)
            fixtures_found = False
            for fixture in ('bad', 'good'):
                src = fixture_dir / f'{fixture}.ts'
                if src.exists():
                    shutil.copy(src, staged / f'{fixture}.ts')
                    fixtures_found = True
            if not fixtures_found:
                failures.append(f'{rule_id}: no bad.ts or good.ts fixture found')
                continue

            results = run_semgrep(rule_path, Path(tmp))
            flagged = {Path(r['path']).name for r in results}

        bad_exists = (fixture_dir / 'bad.ts').exists()
        good_exists = (fixture_dir / 'good.ts').exists()
        if bad_exists and 'bad.ts' not in flagged:
            failures.append(f'{rule_id}: bad.ts should have been flagged but was not')
        if good_exists and 'good.ts' in flagged:
            failures.append(f'{rule_id}: good.ts was flagged but should not have been')

        status = 'ok' if not any(f.startswith(rule_id) for f in failures) else 'FAIL'
        print(f'{status}  {rule_id}')

    if failures:
        print('\nFailures:', file=sys.stderr)
        for f in failures:
            print(f'  - {f}', file=sys.stderr)
        return 1
    print(f'\nAll {len(rule_ids)} rule(s) passed their fixtures.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
