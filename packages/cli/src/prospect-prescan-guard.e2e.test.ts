/**
 * A prescan run drives Chromium against live third-party sites, so the one
 * thing the CLI must never do is start an unbounded batch. This spawns the
 * real CLI and proves the refusal happens on the arguments alone: the child's
 * MONGODB_URI points at a port nothing listens on, so any run that reached the
 * database would fail with a connection error instead of the bounded-batch
 * message asserted here.
 *
 * No Docker gate and no fixture: nothing here connects, renders, or writes.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot } from '@odysseus/scanner';

const WORKSPACE_ROOT = findWorkspaceRoot();
const CLI_ENTRY = path.join(WORKSPACE_ROOT, 'packages/cli/src/index.ts');
const TSX_BIN = path.join(WORKSPACE_ROOT, 'node_modules/.bin/tsx');

// Reachable-looking but dead: a connection attempt fails fast and loudly
// rather than hanging for the driver's default server-selection window.
const UNREACHABLE_MONGO = 'mongodb://127.0.0.1:1/odysseus-prescan-guard-test';

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [CLI_ENTRY, ...args], {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, MONGODB_URI: UNREACHABLE_MONGO },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('odysseus prospect prescan: batch bounds', () => {
  it('refuses a run with no --limit, before opening a connection', async () => {
    const result = await runCli(['prospect', 'prescan', 'run']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--limit is required');
    // The refusal is about the arguments. If it had reached the database, this
    // is the message we would see instead.
    expect(result.stderr).not.toContain('ECONNREFUSED');
    expect(result.stdout).toBe('');
  }, 60_000);

  it('rejects a non-positive --limit rather than treating it as unbounded', async () => {
    const result = await runCli(['prospect', 'prescan', 'run', '--limit', '0']);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('must be a positive integer');
  }, 60_000);

  it('documents both subcommands without touching the database', async () => {
    const result = await runCli(['prospect', 'prescan', '--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('run');
    expect(result.stdout).toContain('report');
    expect(result.stderr).toBe('');
  }, 60_000);
});
