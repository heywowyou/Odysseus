/**
 * A contact run makes plain HTTP requests to live third-party hotel sites, so
 * the CLI must never start an unbounded batch. This spawns the real CLI and
 * proves the refusal happens on the arguments alone: the child's MONGODB_URI
 * points at a port nothing listens on, so any run that reached the database
 * would fail with a connection error instead of the bounded-batch message
 * asserted here.
 *
 * Same shape and same reasoning as prospect-prescan-guard.e2e.test.ts. No
 * Docker gate and no fixture: nothing here connects, fetches, or writes.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot } from '@odysseus/scanner';

const WORKSPACE_ROOT = findWorkspaceRoot();
const CLI_ENTRY = path.join(WORKSPACE_ROOT, 'packages/cli/src/index.ts');
const TSX_BIN = path.join(WORKSPACE_ROOT, 'node_modules/.bin/tsx');

const UNREACHABLE_MONGO = 'mongodb://127.0.0.1:1/odysseus-contacts-guard-test';

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

describe('odysseus prospect contacts: batch bounds', () => {
  it('refuses a run with no bound at all, before opening a connection', async () => {
    const result = await runCli(['prospect', 'contacts', 'run']);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--limit or --domain is required');
    expect(result.stderr).not.toContain('ECONNREFUSED');
    expect(result.stdout).toBe('');
  }, 60_000);

  it('rejects a non-positive --limit rather than treating it as unbounded', async () => {
    const result = await runCli(['prospect', 'contacts', 'run', '--limit', '0']);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('must be a positive integer');
  }, 60_000);

  it('documents the dry run and both subcommands without touching the database', async () => {
    const runHelp = await runCli(['prospect', 'contacts', 'run', '--help']);
    expect(runHelp.code).toBe(0);
    expect(runHelp.stdout).toContain('--dry-run');
    expect(runHelp.stdout).toContain('--domain');

    const groupHelp = await runCli(['prospect', 'contacts', '--help']);
    expect(groupHelp.code).toBe(0);
    expect(groupHelp.stdout).toContain('run');
    expect(groupHelp.stdout).toContain('report');
    expect(groupHelp.stderr).toBe('');
  }, 60_000);
});
