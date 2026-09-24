#!/usr/bin/env node

/**
 * Runs Renovate locally against the committed HEAD and prints the updates
 * that renovate.json allows today, grouped the way Renovate would branch them.
 *
 * Renovate runs in its `local` platform mode (a lookup only): it never pushes
 * a branch, opens a PR or an issue, and never triggers GitHub Actions. The
 * update is applied locally with pnpm and verified with the local gates
 * (docs/agents/coding-conventions.md, "Dependency maintenance").
 *
 * The committed HEAD is cloned into a temporary directory so uncommitted work,
 * untracked audit artifacts and node_modules never reach the container. A
 * GitHub token (GITHUB_COM_TOKEN, else `gh auth token`) is passed only to
 * raise the rate limit on GitHub-hosted lookups (Actions, tags); it is never
 * printed and nothing is written to GitHub.
 *
 * Usage: pnpm run deps:check [-- --json <file>]
 * Output: a report on stdout, and reports/dependency-updates.json (gitignored).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Renovate tracks this pin itself through the custom manager in renovate.json.
const RENOVATE_IMAGE = 'ghcr.io/renovatebot/renovate:44.112.0';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsonFlag = process.argv.indexOf('--json');
const jsonPath =
  jsonFlag !== -1 && process.argv[jsonFlag + 1] !== undefined
    ? path.resolve(process.argv[jsonFlag + 1])
    : path.join(repoRoot, 'reports', 'dependency-updates.json');

const UPDATE_TYPE_RANK = { pin: 0, pinDigest: 0, digest: 1, patch: 2, minor: 3, major: 4 };

function githubToken() {
  if (process.env.GITHUB_COM_TOKEN) return process.env.GITHUB_COM_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function makeReadable(dir) {
  // The container runs as its own user; the clone must be world-readable.
  chmodSync(dir, 0o755);
  for (const entry of readdirSync(dir)) {
    const child = path.join(dir, entry);
    // lstat, never stat: a symlink in the clone must not redirect a chmod outside it.
    const stats = lstatSync(child);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) makeReadable(child);
    else chmodSync(child, stats.mode | 0o444);
  }
}

function cloneHead() {
  const dir = mkdtempSync(path.join(tmpdir(), 'odysseus-renovate-'));
  execFileSync('git', [
    'clone',
    '--quiet',
    '--no-hardlinks',
    '--depth',
    '1',
    `file://${repoRoot}`,
    dir,
  ]);
  makeReadable(dir);
  return dir;
}

function runRenovate(cloneDir) {
  const token = githubToken();
  const env = {
    ...process.env,
    ...(token !== undefined ? { RENOVATE_GITHUB_COM_TOKEN: token } : {}),
  };
  const args = [
    'run',
    '--rm',
    '-v',
    `${cloneDir}:/usr/src/app:ro`,
    '-w',
    '/usr/src/app',
    '-e',
    'LOG_LEVEL=debug',
    '-e',
    'LOG_FORMAT=json',
    '-e',
    'RENOVATE_PLATFORM=local',
    '-e',
    'RENOVATE_REQUIRE_CONFIG=required',
    '-e',
    'RENOVATE_BASE_DIR=/tmp/renovate',
    ...(token !== undefined ? ['-e', 'RENOVATE_GITHUB_COM_TOKEN'] : []),
    RENOVATE_IMAGE,
  ];
  const result = spawnSync('docker', args, { env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, log: result.stdout };
}

function parseLog(log) {
  const updates = [];
  const problems = [];
  let renovateVersion;
  for (const line of log.split('\n')) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    renovateVersion ??= entry.renovateVersion;
    if (entry.level >= 50) problems.push(entry.msg);
    if (entry.msg !== 'packageFiles with updates') continue;
    for (const [manager, files] of Object.entries(entry.config ?? {})) {
      for (const file of files) {
        for (const dep of file.deps ?? []) {
          for (const update of dep.updates ?? []) {
            updates.push({
              group: update.branchName.replace(/^renovate\//, ''),
              manager,
              packageFile: file.packageFile,
              depName: dep.depName,
              depType: dep.depType,
              currentValue: dep.currentValue,
              currentVersion: dep.currentVersion,
              newValue: update.newValue,
              newVersion: update.newVersion,
              currentDigest: dep.currentDigest,
              newDigest: update.newDigest,
              updateType: update.updateType,
              isLockfileUpdate: update.isLockfileUpdate === true,
            });
          }
        }
      }
    }
  }
  return { updates, problems, renovateVersion };
}

function groupUpdates(updates) {
  const groups = new Map();
  for (const update of updates) {
    const group = groups.get(update.group) ?? {
      name: update.group,
      updateType: 'pin',
      updates: [],
    };
    group.updates.push(update);
    if (UPDATE_TYPE_RANK[update.updateType] > UPDATE_TYPE_RANK[group.updateType]) {
      group.updateType = update.updateType;
    }
    groups.set(update.group, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      UPDATE_TYPE_RANK[a.updateType] - UPDATE_TYPE_RANK[b.updateType] ||
      a.name.localeCompare(b.name),
  );
}

function describe(update) {
  // A lockfile update keeps the range, so the installed version is what moves;
  // otherwise the declared range (or pin) in the package file is what changes.
  const from = update.isLockfileUpdate
    ? (update.currentVersion ?? update.currentValue)
    : (update.currentValue ?? update.currentVersion);
  const digest = update.newDigest !== undefined ? `@${update.newDigest.slice(0, 19)}` : '';
  const to = update.isLockfileUpdate
    ? `${update.newVersion} (lockfile)`
    : `${update.newValue}${digest}`;
  return `${update.depName} ${from} -> ${to} [${update.packageFile}]`;
}

function main() {
  const cloneDir = cloneHead();
  let run;
  try {
    run = runRenovate(cloneDir);
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
  }
  const { updates, problems, renovateVersion } = parseLog(run.log);
  if (run.status !== 0 || problems.length > 0) {
    process.stderr.write(
      `Renovate failed (exit ${run.status}): ${problems.join('; ') || 'see docker output'}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const groups = groupUpdates(updates);
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(
    jsonPath,
    `${JSON.stringify({ renovateVersion, generatedAt: new Date().toISOString(), groups }, null, 2)}\n`,
  );

  process.stdout.write(
    `Renovate ${renovateVersion ?? 'unknown'}: ${updates.length} updates in ${groups.length} groups\n`,
  );
  for (const group of groups) {
    process.stdout.write(`\n${group.name} (${group.updateType})\n`);
    for (const line of new Set(group.updates.map(describe))) process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write(`\nMachine-readable list: ${path.relative(repoRoot, jsonPath)}\n`);
}

main();
