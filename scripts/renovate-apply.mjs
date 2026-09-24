#!/usr/bin/env node

/**
 * Applies one or more groups from the local Renovate report
 * (reports/dependency-updates.json, written by `pnpm run deps:check`) to the
 * working tree, the way Renovate's branch for that group would.
 *
 * - npm range and pin updates rewrite the package.json specifier. When a dev
 *   dependency is both pinned and bumped in one group, the result is the new
 *   exact version (the pinning policy of config:best-practices).
 * - Lockfile-only updates keep the range and lock the exact version the report
 *   named (`pnpm update --no-save`), so the minimum release age holds.
 * - The packageManager field gets the new pnpm version and its sha512.
 * - Docker and GitHub Actions updates rewrite the tag and pin the digest.
 *
 * An update the report marks pending (younger than the minimum release age)
 * is skipped. It never commits and never touches a major unless the group is named
 * explicitly with --allow-major. Usage:
 *   node scripts/renovate-apply.mjs <group> [<group>...] [--allow-major]
 *   node scripts/renovate-apply.mjs --list
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(repoRoot, 'reports', 'dependency-updates.json');
const args = process.argv.slice(2);
const allowMajor = args.includes('--allow-major');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

if (args.includes('--list')) {
  for (const group of report.groups) process.stdout.write(`${group.name} (${group.updateType})\n`);
  process.exit(0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function readText(file) {
  return readFileSync(path.join(repoRoot, file), 'utf8');
}

function writeText(file, text) {
  writeFileSync(path.join(repoRoot, file), text);
}

function packageManagerValue(update) {
  // npm integrity is base64 sha512; corepack's packageManager hash is its hex form.
  const [, base64] = update.newDigest.split('sha512-');
  return `pnpm@${update.newValue}+sha512.${Buffer.from(base64, 'base64').toString('hex')}`;
}

function applyNpmSpecifiers(updates) {
  const byFileAndDep = new Map();
  for (const update of updates) {
    if (update.isLockfileUpdate) continue;
    const key = `${update.packageFile}\0${update.depName}`;
    byFileAndDep.set(key, [...(byFileAndDep.get(key) ?? []), update]);
  }
  for (const entries of byFileAndDep.values()) {
    const { packageFile, depName, depType } = entries[0];
    const pkg = JSON.parse(readText(packageFile));
    if (depType === 'packageManager') {
      pkg.packageManager = packageManagerValue(entries[0]);
    } else {
      const isPinned = entries.some((entry) => entry.updateType === 'pin');
      const bump = entries.find((entry) => entry.updateType !== 'pin');
      const next = bump === undefined ? entries[0].newValue : bump.newValue;
      const value = isPinned ? next.replace(/^[\^~]/, '') : next;
      if (pkg[depType]?.[depName] === undefined) {
        throw new Error(`${packageFile}: ${depName} not found in ${depType}`);
      }
      pkg[depType][depName] = value;
    }
    writeText(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

function applyImageOrAction(update) {
  let text = readText(update.packageFile);
  const before = text;
  if (update.manager === 'github-actions' && !update.depName.includes('/')) {
    // A service container image inside a workflow (for example mongo).
    const from = `${update.depName}:${update.currentValue}`;
    const pattern = new RegExp(`${escapeRegExp(from)}(@sha256:[0-9a-f]+)?(?=\\s|$)`, 'gm');
    text = text.replace(pattern, `${update.depName}:${update.newValue}@${update.newDigest}`);
  } else if (update.manager === 'github-actions') {
    const from = escapeRegExp(update.currentDigest ?? update.currentValue);
    const pattern = new RegExp(
      `(uses: ${escapeRegExp(update.depName)}(?:/[\\w-]+)?)@${from}(\\s*#[^\\n]*)?`,
      'g',
    );
    text = text.replace(pattern, `$1@${update.newDigest} # ${update.newValue}`);
  } else {
    const from = `${update.depName}:${update.currentValue}`;
    const pattern = new RegExp(`${escapeRegExp(from)}(@sha256:[0-9a-f]+)?(?=\\s|$)`, 'gm');
    const digest = update.newDigest !== undefined ? `@${update.newDigest}` : '';
    text = text.replace(pattern, `${update.depName}:${update.newValue}${digest}`);
  }
  if (text === before) throw new Error(`${update.packageFile}: no reference to ${update.depName}`);
  writeText(update.packageFile, text);
}

function pnpm(pnpmArgs) {
  execFileSync('pnpm', pnpmArgs, { cwd: repoRoot, stdio: 'inherit' });
}

const names = args.filter((arg) => !arg.startsWith('--'));
if (names.length === 0) {
  process.stderr.write('Name at least one group (see --list).\n');
  process.exit(1);
}
for (const name of names) {
  const group = report.groups.find((candidate) => candidate.name === name);
  if (group === undefined) throw new Error(`No group named ${name} in the report.`);
  if (group.updateType === 'major' && !allowMajor) {
    throw new Error(`${name} is a major update; review it and pass --allow-major.`);
  }
  const ready = group.updates.filter((update) => update.pending !== true);
  if (ready.length === 0) {
    process.stdout.write(`Skipped ${name}: every update is younger than the minimum release age\n`);
    continue;
  }
  const npmUpdates = ready.filter((update) => update.manager === 'npm');
  applyNpmSpecifiers(npmUpdates);
  for (const update of ready) {
    if (update.manager !== 'npm') applyImageOrAction(update);
  }
  pnpm(['install']);
  const locked = [
    ...new Set(
      npmUpdates
        .filter((update) => update.isLockfileUpdate)
        .map((update) => `${update.depName}@${update.newVersion}`),
    ),
  ];
  if (locked.length > 0) pnpm(['update', '-r', '--no-save', ...locked]);
  process.stdout.write(`Applied ${name}\n`);
}
